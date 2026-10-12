"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getManagerFromSession, getStaffFromSession } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import { completeCloverOrder, confirmCloverPayments } from "@/lib/clover";
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
): Promise<Result> {
  const parsed = z
    .object({ orderId: z.string().min(1).max(64), paidWith: z.enum(["CASH", "CARD_PRESENT"]).nullable() })
    .safeParse({ orderId, paidWith });
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  return run((staffId) => markOnlinePickedUp(parsed.data.orderId, staffId, parsed.data.paidWith));
}

/** Polled by the queue screen. Also picks up Clover payments the webhook missed. */
export async function fetchOnlineQueue(): Promise<QueueOrder[] | null> {
  const staff = await getStaffFromSession();
  if (!staff) return null;
  await confirmCloverPayments().catch((e) => console.error("Clover check from queue failed:", e));
  return getOnlineQueue();
}

/** Manager saw the payment in the Clover dashboard: send the order to the kitchen. */
export async function confirmCardPaidManually(orderId: string): Promise<Result> {
  const id = z.string().min(1).max(64).safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can confirm a payment" };
  const res = await completeCloverOrder(id.data, `confirmed-by:${manager.name}`.slice(0, 60));
  if (res === "unknown") return { ok: false, error: "This order isn't waiting for a Clover payment" };
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
  const res = await prisma.order.updateMany({
    where: { id: id.data, source: "ONLINE_PICKUP", status: "OPEN" },
    data: { status: "VOIDED", voidedAt: new Date(), voidedReason: "Card payment not completed", voidedByStaffId: manager.id },
  });
  if (res.count === 0) return { ok: false, error: "This order is no longer waiting for payment" };
  revalidatePath("/online");
  revalidatePath("/orders");
  return { ok: true };
}
