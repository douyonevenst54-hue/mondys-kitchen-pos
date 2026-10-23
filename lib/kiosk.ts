import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { isOrderable, weekdayIn } from "@/lib/menu-visibility";
import { barcodeVariants, canonicalBarcode } from "@/lib/barcode";
import { withUniqueConfirmationCode } from "@/lib/confirmation-code";
import { PortionError, sellPortions } from "@/lib/portions";
import { getStripe, stripeTestMode, toCents } from "@/lib/stripe";
import {
  SquareError,
  cancelTerminalCheckout,
  createTerminalCheckout,
  getSquarePayment,
  getTerminalCheckout,
  squareStatus,
} from "@/lib/square";
import { queueReceipt } from "@/lib/print-queue";

/**
 * Self-checkout: the customer scans stickered items, sees each price, and
 * pays on the card reader next to the screen. The amount always comes from
 * the database; the screen only sends what was scanned.
 *
 * Payment, from Online settings > Self-checkout:
 *  - "square": Square Terminal (Terminal API)
 *  - "stripe": the paired Stripe reader (S700/S710)
 *  - "counter": no reader at the self-checkout: the order shows up on
 *    the Online orders screen as "pay at counter", and staff take the payment.
 */

export class KioskError extends Error {}

export type KioskMode = "square" | "stripe" | "counter";
export type KioskItem = { id: string; name: string; price: number };
export type KioskPayState =
  | { state: "waiting"; total: number }
  | { state: "paid"; total: number; card: string | null; orderNumber: number }
  | { state: "failed"; total: number; message: string }
  | { state: "canceled"; total: number; message: string }
  | { state: "counter"; total: number; code: string; orderNumber: number };

const KIOSK_STAFF_EMAIL = "self-checkout@system.pos";
const MAX_QTY = 20;

export async function kioskMode(): Promise<{ mode: KioskMode; chosen: KioskMode; problem: string | null; autoPrint: boolean }> {
  const s = await prisma.restaurantSettings.findFirst({
    select: { kioskPayment: true, kioskAutoPrint: true, squareDeviceId: true, cardReaderId: true },
  });
  const chosen = (["square", "stripe", "counter"].includes(s?.kioskPayment ?? "") ? s!.kioskPayment : "counter") as KioskMode;
  const autoPrint = s?.kioskAutoPrint ?? true;
  if (chosen === "square") {
    const st = squareStatus();
    if (!st.enabled) return { mode: "counter", chosen, problem: st.problem, autoPrint };
    if (!s?.squareDeviceId) return { mode: "counter", chosen, problem: "No Square Terminal is paired yet", autoPrint };
  }
  if (chosen === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) return { mode: "counter", chosen, problem: "STRIPE_SECRET_KEY is not set", autoPrint };
    if (!s?.cardReaderId) return { mode: "counter", chosen, problem: "No Stripe reader is paired yet", autoPrint };
  }
  return { mode: chosen, chosen, problem: null, autoPrint };
}

async function kioskStaffId(): Promise<string> {
  const found = await prisma.staff.findUnique({ where: { email: KIOSK_STAFF_EMAIL }, select: { id: true } });
  if (found) return found.id;
  const row = await prisma.staff.upsert({
    where: { email: KIOSK_STAFF_EMAIL },
    update: {},
    create: {
      email: KIOSK_STAFF_EMAIL,
      name: "Self-checkout",
      role: "CASHIER",
      isActive: false, // can never sign in
      pinHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
    },
    select: { id: true },
  });
  return row.id;
}

/** A scanned code → the item and price, or a message for the customer. */
export async function kioskLookup(raw: string): Promise<{ ok: true; item: KioskItem } | { ok: false; message: string }> {
  const code = canonicalBarcode(raw);
  if (!code) return { ok: false, message: "That barcode didn't read. Try scanning it again." };
  const s = await getSettings();
  const item = await prisma.menuItem.findFirst({
    where: { barcode: { in: barcodeVariants(code) }, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      isActive: true,
      isAvailable: true,
      portionsLeft: true,
      showOnRegister: true,
      showOnline: true,
      serveDays: true,
      _count: { select: { modifierGroups: true } },
    },
  });
  if (!item) return { ok: false, message: "We couldn't find this item. Please ask a staff member for help." };
  if (item._count.modifierGroups > 0) return { ok: false, message: `${item.name} needs choices. Please pay for it at the counter.` };
  if (!isOrderable(item, "register", weekdayIn(s.timezone))) {
    return { ok: false, message: `${item.name} can't be sold right now. Please ask a staff member.` };
  }
  return { ok: true, item: { id: item.id, name: item.name, price: Number(item.price) } };
}

type Line = { menuItemId: string; quantity: number };

async function priceLines(lines: Line[]) {
  if (!lines.length) throw new KioskError("Scan an item first");
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.menuItemId, Math.min(MAX_QTY, (merged.get(l.menuItemId) ?? 0) + l.quantity));
  const s = await getSettings();
  const weekday = weekdayIn(s.timezone);
  const items = await prisma.menuItem.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: {
      id: true,
      name: true,
      price: true,
      isActive: true,
      isAvailable: true,
      portionsLeft: true,
      showOnRegister: true,
      showOnline: true,
      serveDays: true,
      _count: { select: { modifierGroups: true } },
    },
  });
  const priced = [...merged.entries()].map(([id, quantity]) => {
    const it = items.find((i) => i.id === id);
    if (!it || it._count.modifierGroups > 0 || !isOrderable(it, "register", weekday)) {
      throw new KioskError(`${it?.name ?? "An item"} can't be sold here right now. Remove it, or ask a staff member.`);
    }
    if (it.portionsLeft !== null && it.portionsLeft < quantity) {
      throw new KioskError(`Only ${Math.max(0, it.portionsLeft)} ${it.name} left in the system. Please ask a staff member.`);
    }
    const unitPrice = Number(it.price);
    return { menuItemId: id, quantity, unitPrice, nameSnapshot: it.name, lineTotal: Math.round(unitPrice * quantity * 100) / 100 };
  });
  const subtotal = Math.round(priced.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
  const taxAmount = Math.round(subtotal * s.taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { priced, subtotal, taxAmount, total, settings: s };
}

/** Totals for the screen (tax included), checked against the database. */
export async function kioskQuote(lines: Line[]) {
  const { subtotal, taxAmount, total } = await priceLines(lines);
  return { subtotal, taxAmount, total };
}

/** Create the order and send the total to the card reader (or to the counter). */
export async function startKioskPayment(lines: Line[]): Promise<{ orderId: string; pay: KioskPayState }> {
  const { mode } = await kioskMode();
  const { priced, subtotal, taxAmount, total, settings } = await priceLines(lines);
  const staffId = await kioskStaffId();
  const counter = mode === "counter";

  const order = await withUniqueConfirmationCode((code) =>
    prisma.order.create({
      data: {
        staffId,
        source: "KIOSK",
        orderType: "TAKEOUT",
        // Card: invisible until paid. Counter: waiting on the Online orders screen.
        status: counter ? "READY" : "OPEN",
        customerName: "Self-checkout",
        onlineConfirmationCode: code,
        kitchenDoneAt: new Date(), // already made: never on the kitchen screen
        subtotal,
        taxAmount,
        total,
        items: { create: priced },
        payments: {
          create: {
            method: mode === "square" ? "SQUARE_TERMINAL" : counter ? "CASH" : "CARD_PRESENT",
            status: "PENDING",
            amount: total,
          },
        },
      },
      select: { id: true, orderNumber: true, onlineConfirmationCode: true, payments: { select: { id: true } } },
    }),
  );
  const paymentId = order.payments[0].id;

  if (counter) return { orderId: order.id, pay: { state: "counter", total, code: order.onlineConfirmationCode ?? "", orderNumber: order.orderNumber } };

  try {
    if (mode === "square") {
      const s = await prisma.restaurantSettings.findFirst({ select: { squareDeviceId: true } });
      const co = await createTerminalCheckout({
        amountCents: toCents(total),
        deviceId: s!.squareDeviceId!,
        referenceId: order.id,
        note: `${settings.name} self-checkout #${order.orderNumber}`,
        idempotencyKey: `kiosk-${order.id}`,
      });
      await prisma.payment.update({ where: { id: paymentId }, data: { processorRef: `sqco:${co.id}` } });
    } else {
      const stripe = getStripe();
      const s = await prisma.restaurantSettings.findFirst({ select: { cardReaderId: true } });
      const pi = await stripe.paymentIntents.create({
        amount: toCents(total),
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        description: `${settings.name} self-checkout #${order.orderNumber}`,
        metadata: { source: "pos-kiosk", orderId: order.id, paymentId },
      });
      await prisma.payment.update({ where: { id: paymentId }, data: { processorRef: pi.id } });
      await stripe.terminal.readers.processPaymentIntent(s!.cardReaderId!, { payment_intent: pi.id });
    }
  } catch (e) {
    await giveUp(order.id, "Card reader didn't respond");
    const msg = e instanceof SquareError || e instanceof Error ? e.message : "";
    console.error("Kiosk reader start failed:", msg);
    throw new KioskError(
      /offline|not.*connected|DEVICE/i.test(msg)
        ? "The card reader is offline. Please pay at the counter."
        : "The card reader didn't respond. Try again, or pay at the counter.",
    );
  }
  return { orderId: order.id, pay: { state: "waiting", total } };
}

async function kioskOrder(orderId: string) {
  const o = await prisma.order.findFirst({
    where: { id: orderId, source: "KIOSK" },
    select: {
      id: true,
      status: true,
      total: true,
      orderNumber: true,
      onlineConfirmationCode: true,
      staffId: true,
      items: { select: { menuItemId: true, quantity: true } },
      payments: { select: { id: true, status: true, processorRef: true, cardBrand: true, cardLast4: true, method: true }, take: 1 },
    },
  });
  if (!o || !o.payments[0]) throw new KioskError("Order not found");
  return o;
}

const cardText = (brand: string | null, last4: string | null) =>
  last4 ? `${(brand ?? "Card").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} •••• ${last4}` : null;

/** Where the payment stands. Records the sale the moment the reader approves it. */
export async function checkKioskPayment(orderId: string): Promise<KioskPayState> {
  const o = await kioskOrder(orderId);
  const p = o.payments[0];
  const total = Number(o.total);
  if (p.status === "COMPLETED") return { state: "paid", total, card: cardText(p.cardBrand, p.cardLast4), orderNumber: o.orderNumber };
  if (o.status === "VOIDED") return { state: "canceled", total, message: "Payment cancelled" };
  if (o.status === "READY") return { state: "counter", total, code: o.onlineConfirmationCode ?? "", orderNumber: o.orderNumber };

  const ref = p.processorRef ?? "";
  if (ref.startsWith("sqco:")) {
    const co = await getTerminalCheckout(ref.slice(5));
    if (co.status === "COMPLETED" && co.payment_ids?.[0]) {
      const pay = await getSquarePayment(co.payment_ids[0]);
      const paidCents = pay.amount_money.amount;
      if (paidCents !== toCents(total)) {
        console.error(`Square amount mismatch on ${pay.id} for kiosk order ${o.id}`);
        return { state: "failed", total, message: "The amount didn't match. Please ask a staff member." };
      }
      await recordPaid(o, {
        method: "SQUARE_TERMINAL",
        ref: `square:${pay.id}`,
        brand: pay.card_details?.card?.card_brand ?? null,
        last4: pay.card_details?.card?.last_4 ?? null,
      });
      return checkKioskPayment(orderId);
    }
    if (co.status === "CANCELED") {
      await giveUp(o.id, co.cancel_reason === "TIMED_OUT" ? "Timed out at the reader" : "Cancelled at the reader");
      return {
        state: "canceled",
        total,
        message: co.cancel_reason === "TIMED_OUT" ? "The card reader timed out." : "The payment was cancelled on the card reader.",
      };
    }
    return { state: "waiting", total };
  }

  if (ref.startsWith("pi_")) {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(ref, { expand: ["latest_charge"] });
    if (pi.status === "succeeded") {
      if (pi.amount_received !== toCents(total)) return { state: "failed", total, message: "The amount didn't match. Please ask a staff member." };
      const charge = typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null;
      const cp = charge?.payment_method_details?.card_present ?? null;
      await recordPaid(o, { method: "CARD_PRESENT", ref: pi.id, brand: cp?.brand ?? null, last4: cp?.last4 ?? null });
      return checkKioskPayment(orderId);
    }
    const s = await prisma.restaurantSettings.findFirst({ select: { cardReaderId: true } });
    if (s?.cardReaderId) {
      const r = (await stripe.terminal.readers.retrieve(s.cardReaderId)) as Stripe.Terminal.Reader;
      const a = r.action;
      if (a?.type === "process_payment_intent" && a.process_payment_intent?.payment_intent === pi.id && a.status === "failed") {
        return { state: "failed", total, message: a.failure_message || "The card was declined. Try another card." };
      }
    }
    return { state: "waiting", total };
  }
  return { state: "canceled", total, message: "Payment cancelled" };
}

/** Customer pressed Cancel: clear the reader and close the order. */
export async function cancelKioskPayment(orderId: string): Promise<KioskPayState> {
  const o = await kioskOrder(orderId);
  const p = o.payments[0];
  if (p.status === "COMPLETED") return checkKioskPayment(orderId);
  const ref = p.processorRef ?? "";
  try {
    if (ref.startsWith("sqco:")) {
      const co = await cancelTerminalCheckout(ref.slice(5));
      if (co.status === "COMPLETED") return checkKioskPayment(orderId);
    } else if (ref.startsWith("pi_")) {
      const s = await prisma.restaurantSettings.findFirst({ select: { cardReaderId: true } });
      if (s?.cardReaderId) await getStripe().terminal.readers.cancelAction(s.cardReaderId).catch(() => undefined);
      const pi = await getStripe().paymentIntents.retrieve(ref);
      if (pi.status === "succeeded") return checkKioskPayment(orderId);
      if (pi.status !== "canceled") await getStripe().paymentIntents.cancel(ref).catch(() => undefined);
    }
  } catch (e) {
    // The card may be mid-payment: re-check instead of closing the order.
    console.error("Kiosk cancel:", e);
    const now = await checkKioskPayment(orderId);
    if (now.state === "paid") return now;
  }
  await giveUp(o.id, "Cancelled at self-checkout");
  return { state: "canceled", total: Number(o.total), message: "Payment cancelled. Nothing was charged." };
}

/** Test mode only: tap a test card on Stripe's simulated reader. */
export async function simulateKioskTap(orderId: string): Promise<KioskPayState> {
  if (!stripeTestMode()) throw new KioskError("Only in test mode");
  const s = await prisma.restaurantSettings.findFirst({ select: { cardReaderId: true } });
  if (!s?.cardReaderId) throw new KioskError("No reader");
  await getStripe().testHelpers.terminal.readers.presentPaymentMethod(s.cardReaderId, {
    type: "card_present",
    card_present: { number: "4242424242424242" },
  });
  return checkKioskPayment(orderId);
}

async function recordPaid(
  o: Awaited<ReturnType<typeof kioskOrder>>,
  pay: { method: "SQUARE_TERMINAL" | "CARD_PRESENT"; ref: string; brand: string | null; last4: string | null },
) {
  let first = false;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: o.payments[0].id, status: "PENDING" },
      data: { method: pay.method, status: "COMPLETED", processedAt: new Date(), processorRef: pay.ref.slice(0, 190), cardBrand: pay.brand, cardLast4: pay.last4 },
    });
    if (claimed.count === 0) return;
    first = true;
    await tx.order.update({ where: { id: o.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    try {
      await tx.$executeRaw`SAVEPOINT portions`;
      await sellPortions(tx, o.items, o.staffId, o.id);
    } catch (e) {
      if (!(e instanceof PortionError)) throw e;
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT portions`; // paid already: keep the sale, counts are just off
    }
  });
  if (first) {
    const { autoPrint } = await kioskMode();
    if (autoPrint) await queueReceipt(o.id).catch((e) => console.error("Receipt print failed:", e));
  }
}

async function giveUp(orderId: string, reason: string) {
  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: orderId, status: { in: ["OPEN"] } },
      data: { status: "VOIDED", voidedAt: new Date(), voidedReason: reason },
    }),
    prisma.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } }),
  ]);
}
