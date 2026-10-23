"use server";

import { getStaffFromSession } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import { cloverLookupEnabled } from "@/lib/clover";
import {
  SquareError,
  cancelRegisterCharge,
  readRegisterCharge,
  refundUnusedCharge,
  registerSquareInfo,
  startRegisterCharge,
  type ChargeState,
} from "@/lib/square-register";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<R<T>> {
  if (!(await getStaffFromSession())) return { ok: false, error: "Sign in again" };
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof SquareError) return { ok: false, error: e.message };
    console.error("Square register action failed:", e);
    return { ok: false, error: "Couldn't reach Square. Check the internet and try again." };
  }
}

/**
 * Send an amount to the register's Square Terminal. For a pickup order the
 * amount always comes from the order in the database.
 */
export async function startSquareCharge(input: {
  total: number;
  orderId?: string | null;
  manual?: boolean;
}): Promise<R<{ checkoutId: string; cents: number }>> {
  return guard(async () => {
    let cents = Math.round(Number(input.total) * 100);
    let note = "Register sale";
    if (input.orderId) {
      if (typeof input.orderId !== "string" || input.orderId.length > 64) throw new SquareError("Invalid order");
      const o = await prisma.order.findUnique({ where: { id: input.orderId }, select: { total: true, onlineConfirmationCode: true } });
      if (!o) throw new SquareError("Order not found");
      cents = Math.round(Number(o.total) * 100);
      note = `Pickup ${o.onlineConfirmationCode ?? ""}`.trim();
    }
    const co = await startRegisterCharge({ amountCents: cents, manual: input.manual === true, note });
    return { checkoutId: co.id, cents };
  });
}

export async function squareChargeStatus(checkoutId: string): Promise<R<{ charge: ChargeState }>> {
  return guard(async () => ({ charge: await readRegisterCharge(String(checkoutId)) }));
}

export async function cancelSquareCharge(checkoutId: string): Promise<R<{ charge: ChargeState }>> {
  return guard(async () => ({ charge: await cancelRegisterCharge(String(checkoutId)) }));
}

export async function refundSquareCharge(checkoutId: string): Promise<R<object>> {
  return guard(async () => {
    await refundUnusedCharge(String(checkoutId));
    return {};
  });
}

/** How the register proves card payments: Square Terminal, Clover lookup, or only a manager. */
export async function registerCardMode(): Promise<"square" | "clover" | "manager"> {
  if (!(await getStaffFromSession())) return "manager";
  if ((await registerSquareInfo()).ready) return "square";
  return cloverLookupEnabled() ? "clover" : "manager";
}
