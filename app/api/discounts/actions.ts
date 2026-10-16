"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { normalizePhone, reconcileLoyalty, upsertCustomer } from "@/lib/loyalty";

export type ActiveDiscount = {
  id: string;
  code: string;
  name: string;
  type: "PERCENT" | "FIXED_AMOUNT" | "COMP";
  value: number;
  requiresManager: boolean;
};

export async function getActiveDiscounts(): Promise<ActiveDiscount[]> {
  const now = new Date();
  const rows = await prisma.discount.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as "PERCENT" | "FIXED_AMOUNT" | "COMP",
    value: Number(r.value),
    requiresManager: r.requiresManager,
  }));
}

const ManagerPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
});

/**
 * Verify a PIN belongs to an OWNER or MANAGER. Used to gate COMP discounts
 * and other privileged actions.
 */
export async function verifyManagerPin(
  pin: string,
): Promise<{ ok: true; staffId: string; name: string } | { ok: false; error: string }> {
  const parsed = ManagerPinSchema.safeParse({ pin });
  if (!parsed.success) {
    return { ok: false, error: "Invalid PIN format" };
  }

  const candidates = await prisma.staff.findMany({
    where: { isActive: true, role: { in: ["OWNER", "MANAGER"] } },
    select: { id: true, name: true, pinHash: true },
  });

  for (const c of candidates) {
    if (await bcrypt.compare(pin, c.pinHash)) {
      return { ok: true, staffId: c.id, name: c.name };
    }
  }
  return { ok: false, error: "Not a manager PIN" };
}
// ─────────────────────────────────────────────────────────────────────────────
// Rosewood Rewards at the register
// ─────────────────────────────────────────────────────────────────────────────

export type RegisterRewards =
  | { ok: true; customerId: string | null; name: string | null; points: number; rewardPoints: number; rewardValue: number }
  | { ok: false; error: string };

/** Look up a customer's points by phone (staff only). */
export async function lookupRegisterRewards(phone: string): Promise<RegisterRewards> {
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Sign in again" };
  const p = normalizePhone(phone);
  if (!p) return { ok: false, error: "Enter a 10-digit phone number" };
  const s = await getSettings();
  if (!s.loyaltyEnabled) return { ok: false, error: "Rewards are turned off" };
  const c = await prisma.customer.findUnique({ where: { phone: p }, select: { id: true, name: true, points: true } });
  return {
    ok: true,
    customerId: c?.id ?? null,
    name: c?.name ?? null,
    points: c?.points ?? 0,
    rewardPoints: s.loyaltyRewardPoints,
    rewardValue: s.loyaltyRewardValue,
  };
}

/**
 * After a register sale: attach the customer's phone so the sale earns points.
 * Only for a sale finished in the last 3 hours that has no customer yet.
 */
export async function addRegisterPoints(
  orderId: string,
  phone: string,
): Promise<{ ok: true; earned: number; balance: number } | { ok: false; error: string }> {
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Sign in again" };
  const p = normalizePhone(phone);
  if (!p) return { ok: false, error: "Enter a 10-digit phone number" };
  if (typeof orderId !== "string" || orderId.length > 64) return { ok: false, error: "Invalid order" };
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, source: true, status: true, customerId: true, customerName: true, createdAt: true },
  });
  if (!order || order.source !== "POS" || order.status !== "COMPLETED") return { ok: false, error: "This sale can't earn points" };
  if (order.customerId) return { ok: false, error: "This sale already has a rewards number" };
  if (Date.now() - order.createdAt.getTime() > 3 * 3_600_000) return { ok: false, error: "Points can only be added within 3 hours of the sale" };

  await prisma.$transaction(async (tx) => {
    const customerId = await upsertCustomer(tx, { phone: p, name: order.customerName });
    await tx.order.updateMany({ where: { id: order.id, customerId: null }, data: { customerId } });
  });
  await reconcileLoyalty(order.id);
  const ev = await prisma.loyaltyEvent.findFirst({ where: { orderId: order.id, kind: "EARN" }, select: { points: true } });
  const c = await prisma.customer.findUnique({ where: { phone: p }, select: { points: true } });
  return { ok: true, earned: ev?.points ?? 0, balance: c?.points ?? 0 };
}
