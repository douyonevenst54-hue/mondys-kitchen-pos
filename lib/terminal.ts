import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, stripeTestMode, toCents } from "@/lib/stripe";

/**
 * Card reader on the counter (Stripe smart reader: WisePOS E or S700).
 *
 * The reader talks to Stripe over Wi-Fi; the POS never talks to it directly.
 * To charge, the POS asks Stripe to show the order's total on the reader, then
 * checks with Stripe until the payment succeeds or fails. The amount always
 * comes from the order in the database, never from the screen.
 *
 * One PaymentIntent per order payment, kept in Payment.processorRef and
 * re-used after a decline or cancel, so a customer can never be charged twice.
 */

export class ReaderError extends Error {}

export const PI_SOURCE = "pos-reader";

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

export type ReaderInfo = {
  paired: boolean;
  id: string | null;
  label: string | null;
  status: "online" | "offline" | "unknown";
  simulated: boolean;
  testMode: boolean;
  problem: string | null;
};

async function settingsRow() {
  return prisma.restaurantSettings.findFirst({
    select: { id: true, name: true, cardReaderId: true, cardReaderLabel: true, terminalLocationId: true },
  });
}

export async function getReaderInfo(opts: { live?: boolean } = {}): Promise<ReaderInfo> {
  const testMode = stripeTestMode();
  const s = await settingsRow();
  const base: ReaderInfo = {
    paired: Boolean(s?.cardReaderId),
    id: s?.cardReaderId ?? null,
    label: s?.cardReaderLabel ?? null,
    status: "unknown",
    simulated: false,
    testMode,
    problem: null,
  };
  if (!s?.cardReaderId || !opts.live) return base;
  try {
    const r = await getStripe().terminal.readers.retrieve(s.cardReaderId);
    if ("deleted" in r && r.deleted) return { ...base, problem: "This reader was removed in Stripe. Pair it again." };
    const reader = r as Stripe.Terminal.Reader;
    return {
      ...base,
      status: reader.status === "online" ? "online" : "offline",
      simulated: reader.device_type.startsWith("simulated"),
    };
  } catch (e) {
    return { ...base, problem: stripeMessage(e, "Couldn't reach Stripe to check the reader.") };
  }
}

export type LocationInput = { line1: string; city: string; state: string; postalCode: string };

/** Register a reader with the code shown on its screen (or Stripe's test reader). */
export async function pairReader(registrationCode: string, label: string, address: LocationInput | null) {
  const stripe = getStripe();
  const s = await settingsRow();
  if (!s) throw new ReaderError("Save the restaurant details in Online settings first.");

  let locationId = s.terminalLocationId;
  if (!locationId) {
    if (!address) throw new ReaderError("Enter the restaurant address so Stripe knows where the reader is.");
    const loc = await stripe.terminal.locations.create({
      display_name: s.name,
      address: {
        line1: address.line1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: "US",
      },
    });
    locationId = loc.id;
    await prisma.restaurantSettings.update({ where: { id: s.id }, data: { terminalLocationId: locationId } });
  }

  let reader: Stripe.Terminal.Reader;
  try {
    reader = await stripe.terminal.readers.create({ registration_code: registrationCode, label, location: locationId });
  } catch (e) {
    throw new ReaderError(stripeMessage(e, "Stripe didn't accept that code. Check it on the reader screen and try again."));
  }
  await prisma.restaurantSettings.update({
    where: { id: s.id },
    data: { cardReaderId: reader.id, cardReaderLabel: label },
  });
  return reader;
}

/** Forget the reader here (it stays registered in Stripe and can be paired again). */
export async function unpairReader() {
  const s = await settingsRow();
  if (!s) return;
  await prisma.restaurantSettings.update({ where: { id: s.id }, data: { cardReaderId: null, cardReaderLabel: null } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Charging an online order at pickup
// ─────────────────────────────────────────────────────────────────────────────

export type ReaderState =
  | { state: "waiting"; amount: number }
  | { state: "succeeded"; amount: number; card: string | null }
  | { state: "failed"; amount: number; message: string }
  | { state: "canceled"; amount: number };

async function requireReader(): Promise<string> {
  const s = await settingsRow();
  if (!s?.cardReaderId) throw new ReaderError("No card reader is paired. A manager can pair one in Card reader settings.");
  return s.cardReaderId;
}

/** The pickup order and its unpaid payment, or a clear error. */
async function unpaidPickup(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, source: "ONLINE_PICKUP" },
    select: {
      id: true,
      status: true,
      total: true,
      onlineConfirmationCode: true,
      payments: { select: { id: true, status: true, processorRef: true }, take: 1 },
    },
  });
  if (!order) throw new ReaderError("Order not found");
  const payment = order.payments[0];
  if (!payment) throw new ReaderError("This order has no payment to collect");
  return { order, payment };
}

/** Send the order total to the reader. Re-uses the order's PaymentIntent if it can. */
export async function startReaderPayment(orderId: string, staffId: string): Promise<ReaderState> {
  const stripe = getStripe();
  const readerId = await requireReader();
  const { order, payment } = await unpaidPickup(orderId);
  const amount = Number(order.total);
  if (payment.status === "COMPLETED") return { state: "succeeded", amount, card: null };
  if (order.status !== "SENT" && order.status !== "READY") throw new ReaderError("This order was already picked up or cancelled");

  let pi: Stripe.PaymentIntent | null = null;
  if (payment.processorRef?.startsWith("pi_")) {
    pi = await stripe.paymentIntents.retrieve(payment.processorRef);
    if (pi.status === "succeeded") {
      await finalizeReaderPayment(pi.id);
      return checkReaderPayment(orderId);
    }
    // Total changed, or the intent can't be re-used: start a fresh one.
    if (pi.amount !== toCents(amount) || !["requires_payment_method", "requires_confirmation"].includes(pi.status)) {
      if (pi.status !== "canceled") await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
      pi = null;
    }
  }
  if (!pi) {
    pi = await stripe.paymentIntents.create({
      amount: toCents(amount),
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      description: `Pickup order ${order.onlineConfirmationCode ?? order.id}`,
      metadata: { source: PI_SOURCE, orderId: order.id, paymentId: payment.id, staffId },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { processorRef: pi.id } });
  }

  try {
    await stripe.terminal.readers.processPaymentIntent(readerId, {
      payment_intent: pi.id,
      process_config: { enable_customer_cancellation: true },
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "terminal_reader_offline") throw new ReaderError("The card reader is offline. Check that it's on and connected to Wi-Fi.");
    if (code === "terminal_reader_busy") throw new ReaderError("The reader is busy with another payment. Cancel it on the reader or wait a moment.");
    throw new ReaderError(stripeMessage(e, "Couldn't send the amount to the reader. Try again."));
  }
  return { state: "waiting", amount };
}

/** Where the payment stands now. Records it the moment it succeeds. */
export async function checkReaderPayment(orderId: string): Promise<ReaderState> {
  const stripe = getStripe();
  const { order, payment } = await unpaidPickup(orderId);
  const amount = Number(order.total);
  const piId = payment.processorRef?.startsWith("pi_") ? payment.processorRef : null;

  if (payment.status === "COMPLETED") {
    const p = await prisma.payment.findUnique({ where: { id: payment.id }, select: { cardBrand: true, cardLast4: true } });
    return { state: "succeeded", amount, card: cardText(p?.cardBrand ?? null, p?.cardLast4 ?? null) };
  }
  if (!piId) return { state: "canceled", amount };

  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.status === "succeeded") {
    await finalizeReaderPayment(pi.id);
    const p = await prisma.payment.findUnique({ where: { id: payment.id }, select: { cardBrand: true, cardLast4: true } });
    return { state: "succeeded", amount, card: cardText(p?.cardBrand ?? null, p?.cardLast4 ?? null) };
  }

  const s = await settingsRow();
  if (!s?.cardReaderId) return { state: "canceled", amount };
  const r = (await stripe.terminal.readers.retrieve(s.cardReaderId)) as Stripe.Terminal.Reader;
  const action = r.action;
  const forThis = action?.type === "process_payment_intent" && action.process_payment_intent?.payment_intent === pi.id;
  if (!forThis) return { state: "canceled", amount };
  if (action.status === "failed") {
    if (action.failure_code === "customer_canceled") return { state: "canceled", amount };
    return { state: "failed", amount, message: declineText(action.failure_code, action.failure_message) };
  }
  if (action.status === "succeeded") {
    // Reader says done; Stripe will mark the intent succeeded within a moment.
    return { state: "waiting", amount };
  }
  return { state: "waiting", amount };
}

/** Clear the amount from the reader. The PaymentIntent is kept for a retry. */
export async function cancelReaderPayment(orderId: string): Promise<ReaderState> {
  const readerId = await requireReader();
  try {
    await getStripe().terminal.readers.cancelAction(readerId);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "terminal_reader_busy") {
      throw new ReaderError("The customer's card is being processed. Wait a few seconds.");
    }
    // Nothing to cancel (already finished or cleared): fall through to the real state.
  }
  return checkReaderPayment(orderId);
}

/** Test mode only: pretend the customer tapped a card on Stripe's simulated reader. */
export async function simulateTap(orderId: string, outcome: "approve" | "decline"): Promise<ReaderState> {
  if (!stripeTestMode()) throw new ReaderError("Only available in test mode");
  const readerId = await requireReader();
  const info = await getReaderInfo({ live: true });
  if (!info.simulated) throw new ReaderError("Tap a test card on the real reader instead");
  try {
    await getStripe().testHelpers.terminal.readers.presentPaymentMethod(readerId, {
      type: "card_present",
      card_present: { number: outcome === "approve" ? "4242424242424242" : "4000000000009995" },
    });
  } catch (e) {
    throw new ReaderError(stripeMessage(e, "The test reader didn't respond"));
  }
  return checkReaderPayment(orderId);
}

/**
 * Payment went through: mark the order paid (card brand and last 4 for the
 * receipt) and, if it was waiting on the shelf, picked up. Safe to call many
 * times — from the screen and from Stripe's webhook; only the first counts.
 */
export async function finalizeReaderPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  if (pi.status !== "succeeded" || pi.metadata?.source !== PI_SOURCE) return;
  const orderId = pi.metadata.orderId;
  if (!orderId) return;

  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const present = charge?.payment_method_details?.card_present ?? null;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, source: "ONLINE_PICKUP" },
      select: { id: true, status: true, total: true, shiftId: true, payments: { select: { id: true, status: true, processorRef: true }, take: 1 } },
    });
    const payment = order?.payments[0];
    if (!order || !payment || payment.processorRef !== pi.id) return;
    if (pi.currency !== "usd" || pi.amount_received !== toCents(Number(order.total))) {
      console.error(`Reader amount mismatch on ${pi.id} for order ${order.id}`);
      return;
    }
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        method: "CARD_PRESENT",
        status: "COMPLETED",
        processedAt: new Date(),
        cardBrand: present?.brand ?? null,
        cardLast4: present?.last4 ?? null,
      },
    });
    if (claimed.count === 0) return; // already recorded

    let shiftId = order.shiftId;
    const staffId = pi.metadata.staffId;
    if (!shiftId && staffId) {
      const shift = await tx.shift.findFirst({ where: { staffId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true } });
      shiftId = shift?.id ?? null;
    }
    await tx.order.update({
      where: { id: order.id },
      data:
        order.status === "READY"
          ? { status: "COMPLETED", completedAt: new Date(), shiftId }
          : { shiftId }, // paid early; still being made
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function cardText(brand: string | null, last4: string | null): string | null {
  if (!brand && !last4) return null;
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  return last4 ? `${b} •••• ${last4}` : b;
}

function declineText(code: string | null, message: string | null): string {
  switch (code) {
    case "card_declined":
      return message && /insufficient/i.test(message)
        ? "Declined: not enough funds. Ask for another card."
        : "The card was declined. Ask for another card.";
    case "expired_card":
      return "The card is expired. Ask for another card.";
    case "connection_error":
      return "The reader lost its connection. Check Wi-Fi, then try again.";
    default:
      return message ? `Payment didn't go through: ${message}` : "Payment didn't go through. Try again.";
  }
}

function stripeMessage(e: unknown, fallback: string): string {
  const m = (e as { message?: string })?.message;
  return m && m.length < 200 ? m : fallback;
}
