"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStaffFromSession } from "@/lib/staff";
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

/** Polled by the queue screen. */
export async function fetchOnlineQueue(): Promise<QueueOrder[] | null> {
  const staff = await getStaffFromSession();
  if (!staff) return null;
  return getOnlineQueue();
}
