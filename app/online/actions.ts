"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getManagerFromSession, getStaffFromSession } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import { completeCloverOrder, confirmCloverPayments, verifyDevicePayment } from "@/lib/clover";
import { closeSquareCheckout, confirmSquarePayments } from "@/lib/square-online";
import { completePaidOnlineOrder } from "@/lib/online-paid";
import { verifyRegisterCharge } from "@/lib/square-register";
import { checkManagerPin } from "@/lib/manager-pin";
import {
  OnlineOrderError,
  getOnlineQueue,
  markOnlinePickedUp,
  markOnlineReady,
  type QueueOrder,
} from "@/lib/online-orders";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: (staffId: string) => Promise<void>): Promise<Result> {
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Sign in again" };
  try {
    await fn(staff.id);
    revalidatePath("/online");
    revalidatePath("/orders");
    return { ok: true };
  } catch (e) {
    if (e instanceof OnlineOrderError) return { ok: false, error: e.message };
    console.error("Online queue action failed:", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

export async function readyOnlineOrder(orderId: string): Promise<Result> {
  const id = z.string().min(1).max(64).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  return run(() => markOnlineReady(id.data));
}

export async function pickUpOnlineOrder(
  orderId: string,
  paidWith: "CASH" | "CARD_PRESENT" | null,
  verification?: { kind: "clover"; paymentId: string } | { kind: "square"; checkoutId: string } | { kind: "manager"; pin: string },
): Promise<Result> {
  const parsed = z
    .object({ orderId: z.string().min(1).max(64), paidWith: z.enum(["CASH", "CARD_PRESENT"]).nullable() })
    .safeParse({ orderId, paidWith });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  // A card at pickup must be proven, the same as on the register.
  let proof: { ref: string; last4: string | null; brand: string | null } | null = null;
  if (parsed.data.paidWith === "CARD_PRESENT") {
    const staff = await getStaffFromSession();
    if (!staff) return { ok: false, error: "Sign in again" };
    if (!verification) return { ok: false, error: "This card payment hasn't been confirmed yet" };
    if (verification.kind === "clover") {
      const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { total: true } });
      if (!order) return { ok: false, error: "Order not found" };
      const r = await verifyDevicePayment(String(verification.paymentId), Math.round(Number(order.total) * 100));
      if (!r.ok) return { ok: false, error: r.error };
      proof = { ref: r.ref, last4: r.last4, brand: r.brand };
    } else if (verification.kind === "square") {
      const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { total: true } });
      if (!order) return { ok: false, error: "Order not found" };
      const r = await verifyRegisterCharge(String(verification.checkoutId), Math.round(Number(order.total) * 100));
      if (!r.ok) return { ok: false, error: r.error };
      proof = { ref: r.ref, last4: r.last4, brand: r.brand };
    } else {
      const m = await checkManagerPin(String(verification.pin), staff.id);
      if (!m.ok) return { ok: false, error: m.error };
      proof = { ref: `approved-by:${m.name}`.slice(0, 60), last4: null, brand: null };
    }
  }
  return run((staffId) => markOnlinePickedUp(parsed.data.orderId, staffId, parsed.data.paidWith, proof));
}

/** Polled by the queue screen. Also picks up Square/Clover payments the webhook missed. */
export async function fetchOnlineQueue(): Promise<QueueOrder[] | null> {
  const staff = await getStaffFromSession();
  if (!staff) return null;
  await confirmSquarePayments().catch((e) => console.error("Square check from queue failed:", e));
  await confirmCloverPayments().catch((e) => console.error("Clover check from queue failed:", e));
  return getOnlineQueue();
}

/** Manager saw the payment in the Square or Clover dashboard: send the order to the kitchen. */
export async function confirmCardPaidManually(orderId: string): Promise<Result> {
  const id = z.string().min(1).max(64).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can confirm a payment" };
  const proof = `confirmed-by:${manager.name}`.slice(0, 60);
  const waiting = await prisma.payment.findFirst({
    where: { orderId: id.data, status: "PENDING", method: { in: ["SQUARE_ONLINE", "CLOVER_ONLINE"] } },
    select: { method: true },
  });
  const res =
    waiting?.method === "SQUARE_ONLINE"
      ? await completePaidOnlineOrder(id.data, "SQUARE_ONLINE", proof)
      : await completeCloverOrder(id.data, proof);
  if (res === "unknown") return { ok: false, error: "This order isn't waiting for a card payment" };
  revalidatePath("/online");
  revalidatePath("/orders");
  return { ok: true };
}

/** Customer never finished paying: take the order off the list. */
export async function cancelUnpaidOrder(orderId: string): Promise<Result> {
  const id = z.string().min(1).max(64).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can cancel an order" };
  try {
    if ((await closeSquareCheckout(id.data)) === "paid") {
      revalidatePath("/online");
      return { ok: false, error: "Square shows this order paid, so it went to the kitchen instead" };
    }
  } catch (e) {
    console.error("Closing the Square payment link failed:", e);
    return { ok: false, error: "Couldn't reach Square to close the payment page. Try again." };
  }
  const res = await prisma.order.updateMany({
    where: { id: id.data, source: "ONLINE_PICKUP", status: "OPEN" },
    data: { status: "VOIDED", voidedAt: new Date(), voidedReason: "Card payment not completed", voidedByStaffId: manager.id },
  });
  if (res.count === 0) return { ok: false, error: "This order is no longer waiting for payment" };
  revalidatePath("/online");
  revalidatePath("/orders");
  return { ok: true };
}
