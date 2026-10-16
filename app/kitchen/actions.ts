"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStaffFromSession } from "@/lib/staff";
import { bumpTicket, getKitchenBoard, recallTicket, startTicket, toggleKitchenItem, type KitchenBoard } from "@/lib/kitchen";

const Id = z.string().min(1).max(64);

type Result = { ok: true; board: KitchenBoard } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Signed out. Sign in again to keep the kitchen screen running." };
  try {
    await fn();
    revalidatePath("/online");
    return { ok: true, board: await getKitchenBoard() };
  } catch (e) {
    console.error("Kitchen action failed:", e);
    return { ok: false, error: "Couldn't save. Check the connection and tap again." };
  }
}

export async function refreshKitchen(): Promise<Result> {
  return run(async () => undefined);
}

export async function bump(orderId: string): Promise<Result> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid ticket" };
  return run(() => bumpTicket(id.data));
}

export async function recall(orderId: string): Promise<Result> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid ticket" };
  return run(() => recallTicket(id.data));
}

export async function start(orderId: string): Promise<Result> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid ticket" };
  return run(() => startTicket(id.data));
}

export async function toggleItem(itemId: string): Promise<Result> {
  const id = Id.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Invalid item" };
  return run(() => toggleKitchenItem(id.data));
}
