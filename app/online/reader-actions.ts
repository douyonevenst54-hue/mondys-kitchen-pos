"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStaffFromSession } from "@/lib/staff";
import {
  ReaderError,
  cancelReaderPayment,
  checkReaderPayment,
  simulateTap,
  startReaderPayment,
  type ReaderState,
} from "@/lib/terminal";

export type ReaderResult = { ok: true; reader: ReaderState } | { ok: false; error: string };

const OrderId = z.string().min(1).max(64);

async function run(orderId: string, fn: (orderId: string, staffId: string) => Promise<ReaderState>): Promise<ReaderResult> {
  const id = OrderId.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Sign in again" };
  try {
    const reader = await fn(id.data, staff.id);
    if (reader.state === "succeeded") {
      revalidatePath("/online");
      revalidatePath("/orders");
    }
    return { ok: true, reader };
  } catch (e) {
    if (e instanceof ReaderError) return { ok: false, error: e.message };
    console.error("Card reader action failed:", e);
    return { ok: false, error: "Couldn't reach Stripe. Check the internet connection and try again." };
  }
}

/** Show the order total on the card reader. */
export async function chargeOnReader(orderId: string): Promise<ReaderResult> {
  return run(orderId, (id, staffId) => startReaderPayment(id, staffId));
}

/** Polled every couple of seconds while the customer pays. */
export async function readerStatus(orderId: string): Promise<ReaderResult> {
  return run(orderId, (id) => checkReaderPayment(id));
}

export async function cancelOnReader(orderId: string): Promise<ReaderResult> {
  return run(orderId, (id) => cancelReaderPayment(id));
}

/** Test mode with Stripe's simulated reader only. */
export async function testTap(orderId: string, outcome: "approve" | "decline"): Promise<ReaderResult> {
  if (outcome !== "approve" && outcome !== "decline") return { ok: false, error: "Invalid request" };
  return run(orderId, (id) => simulateTap(id, outcome));
}
