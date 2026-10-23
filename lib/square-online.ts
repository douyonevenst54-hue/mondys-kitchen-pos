import "server-only";
import { prisma } from "@/lib/prisma";
import { completePaidOnlineOrder } from "@/lib/online-paid";
import {
  SquareError,
  createPaymentLink,
  deletePaymentLink,
  refundSquarePayment,
  getSquareOrder,
  getSquarePayment,
  squareCardBrand,
  squareOnlineEnabled,
  squarePaidCents,
} from "@/lib/square";

/**
 * Online card payments on Square's own checkout page (a one-time payment
 * link). Card numbers never touch this app. The order stays OPEN (off the
 * kitchen screen) until Square shows the payment: by webhook, or by looking
 * the payment up when the status page or the staff queue checks.
 *
 * Payment.processorRef: "sqlink:<linkId>:<squareOrderId>" while waiting,
 * then "sqlink:…|square:<paymentId>" once paid.
 */

export { SquareError };

export async function startSquareOnlineCheckout(a: {
  orderId: string;
  code: string;
  businessName: string;
  total: number;
  summary: string;
  customer: { email: string | null; phone: string };
  returnBase: string;
}): Promise<{ href: string }> {
  const link = await createPaymentLink({
    name: `${a.businessName} order ${a.code}`,
    amountCents: Math.round(a.total * 100),
    redirectUrl: `${a.returnBase}/order/status/${a.orderId}`,
    note: `${a.code}: ${a.summary}`,
    idempotencyKey: `order-${a.orderId}`,
    buyer: { email: a.customer.email, phone: a.customer.phone },
  });
  await prisma.payment.updateMany({
    where: { orderId: a.orderId, method: "SQUARE_ONLINE", status: "PENDING" },
    data: { processorRef: `sqlink:${link.id}:${link.order_id}`.slice(0, 190) },
  });
  return { href: link.url };
}

const squareOrderIdOf = (ref: string | null) => (ref ?? "").match(/^sqlink:[^:|]+:([^|]+)/)?.[1] ?? null;

/**
 * Check one Square payment and, when it's paid in full, send the order to the
 * kitchen. If staff already cancelled the order (the customer paid anyway),
 * the money goes straight back to the card.
 */
async function settle(orderId: string, total: number, paymentId: string): Promise<boolean> {
  const p = await getSquarePayment(paymentId);
  if (p.status !== "COMPLETED") return false;
  if (squarePaidCents(p) < Math.round(total * 100)) {
    console.error(`Square payment ${p.id} for order ${orderId} is short: ${squarePaidCents(p)} cents`);
    return false;
  }
  const r = await completePaidOnlineOrder(orderId, "SQUARE_ONLINE", `square:${p.id}`, {
    brand: squareCardBrand(p),
    last4: p.card_details?.card?.last_4 ?? null,
  });
  if (r === "done") return true;
  await refundIfCancelled(orderId, p.id, squarePaidCents(p));
  return false;
}

async function refundIfCancelled(orderId: string, paymentId: string, cents: number) {
  const pay = await prisma.payment.findFirst({
    where: { orderId, method: "SQUARE_ONLINE", status: "PENDING", order: { status: "VOIDED" } },
    select: { id: true, processorRef: true, order: { select: { voidedReason: true } } },
  });
  if (!pay) return;
  await refundSquarePayment(paymentId, cents, "Order was cancelled before the payment arrived");
  console.warn(`Order ${orderId} was paid after it was cancelled: refunded ${cents} cents`);
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: pay.id },
      data: {
        status: "REFUNDED",
        processedAt: new Date(), // money in and straight back out, both today
        refundedAt: new Date(),
        refundReason: "Paid after the order was cancelled",
        processorRef: `${pay.processorRef ?? ""}|square:${paymentId}`.slice(0, 190),
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { voidedReason: `${pay.order.voidedReason ?? "Cancelled"} · Paid later: refunded automatically`.slice(0, 500) },
    }),
  ]);
}

/** Ask Square whether one order is paid (errors are thrown, not hidden). */
async function checkOne(orderId: string, total: number, sqOrderId: string): Promise<boolean> {
  const sqOrder = await getSquareOrder(sqOrderId);
  for (const t of sqOrder.tenders ?? []) {
    if (await settle(orderId, total, t.id)) return true;
  }
  return false;
}

// Don't ask Square about the same order more than every few seconds
// (the status page and the staff queue both poll).
const lastLook = new Map<string, number>();
const LOOK_EVERY_MS = 4000;

/**
 * Online orders still waiting on a Square payment (all recent ones, or one):
 * look each up in Square and send the paid ones to the kitchen.
 */
export async function confirmSquarePayments(onlyOrderId?: string): Promise<number> {
  if (!squareOnlineEnabled()) return 0;
  const waiting = await prisma.order.findMany({
    where: {
      ...(onlyOrderId ? { id: onlyOrderId } : { createdAt: { gte: new Date(Date.now() - 6 * 60 * 60_000) } }),
      source: "ONLINE_PICKUP",
      status: "OPEN",
      payments: { some: { method: "SQUARE_ONLINE", status: "PENDING" } },
    },
    select: { id: true, total: true, payments: { where: { method: "SQUARE_ONLINE" }, select: { processorRef: true }, take: 1 } },
    take: 30,
  });
  let n = 0;
  for (const o of waiting) {
    const sqOrderId = squareOrderIdOf(o.payments[0]?.processorRef ?? null);
    if (!sqOrderId) continue;
    const now = Date.now();
    if (now - (lastLook.get(o.id) ?? 0) < LOOK_EVERY_MS) continue;
    lastLook.set(o.id, now);
    try {
      if (await checkOne(o.id, Number(o.total), sqOrderId)) n++;
    } catch (e) {
      console.error(`Square lookup for order ${o.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (lastLook.size > 500) lastLook.clear();
  return n;
}

/**
 * Staff are cancelling an online order that never got paid. Turn the payment
 * link off so it can't be paid later, checking Square before and after (the
 * customer could pay at that very moment). Any Square error stops the cancel.
 */
export async function closeSquareCheckout(orderId: string): Promise<"paid" | "closed" | "none"> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, status: "OPEN" },
    select: { total: true, payments: { where: { method: "SQUARE_ONLINE", status: "PENDING" }, select: { processorRef: true }, take: 1 } },
  });
  const ref = o?.payments[0]?.processorRef ?? null;
  const linkId = (ref ?? "").match(/^sqlink:([^:|]+):/)?.[1];
  const sqOrderId = squareOrderIdOf(ref);
  if (!o || !linkId || !sqOrderId) return "none";
  if (await checkOne(orderId, Number(o.total), sqOrderId)) return "paid";
  await deletePaymentLink(linkId);
  if (await checkOne(orderId, Number(o.total), sqOrderId)) return "paid";
  return "closed";
}

/** Webhook: Square says a payment changed. Re-checked with Square before use. */
export async function onSquarePaymentEvent(paymentId: string, squareOrderId: string | null): Promise<"done" | "ignored"> {
  if (!squareOrderId || !/^[A-Za-z0-9_-]{4,}$/.test(squareOrderId)) return "ignored";
  const pay = await prisma.payment.findFirst({
    where: { method: "SQUARE_ONLINE", status: "PENDING", processorRef: { contains: `:${squareOrderId}` } },
    select: { orderId: true, order: { select: { total: true } } },
  });
  if (!pay) return "ignored";
  return (await settle(pay.orderId, Number(pay.order.total), paymentId)) ? "done" : "ignored";
}
