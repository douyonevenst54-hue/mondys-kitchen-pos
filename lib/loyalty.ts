import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";

/**
 * Rosewood Rewards: customers are known by phone number. They earn points on
 * what they paid for food (after discounts, before tax and tip) once the
 * order is paid and picked up, and spend `rewardPoints` for `rewardValue` off.
 *
 * Points only move through LoyaltyEvent rows (one per order and kind), and
 * reconcileLoyalty() is safe to call any number of times: it looks at the
 * order and books whatever is missing, including reversing points when an
 * order is cancelled.
 */

export type RewardsInfo = {
  enabled: boolean;
  points: number;
  rewardPoints: number;
  rewardValue: number;
  pointsPerDollar: number;
};

export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return /^\d{10}$/.test(ten) ? ten : null;
}

export async function rewardsFor(phone: string | null): Promise<RewardsInfo> {
  const s = await getSettings();
  const base = {
    enabled: s.loyaltyEnabled,
    rewardPoints: s.loyaltyRewardPoints,
    rewardValue: s.loyaltyRewardValue,
    pointsPerDollar: s.loyaltyPointsPerDollar,
  };
  const p = normalizePhone(phone);
  if (!p || !s.loyaltyEnabled) return { ...base, points: 0 };
  const c = await prisma.customer.findUnique({ where: { phone: p }, select: { points: true } });
  return { ...base, points: c?.points ?? 0 };
}

export function pointsEarned(foodAfterDiscounts: number, perDollar: number): number {
  return Math.max(0, Math.floor(foodAfterDiscounts + 1e-9) * perDollar);
}

type Tx = Prisma.TransactionClient;

/** Find or create the customer for a phone number; fills in name/email if new. */
export async function upsertCustomer(
  tx: Tx,
  c: { phone: string; name?: string | null; email?: string | null; marketingOptIn?: boolean },
): Promise<string> {
  const optIn = Boolean(c.marketingOptIn && c.email);
  const row = await tx.customer.upsert({
    where: { phone: c.phone },
    update: {
      ...(c.name ? { name: c.name } : {}),
      ...(c.email ? { email: c.email } : {}),
      // Checking the box opts in; not checking it never opts anyone out.
      ...(optIn ? { marketingOptIn: true, optInAt: new Date(), optOutAt: null } : {}),
      lastOrderAt: new Date(),
    },
    create: {
      phone: c.phone,
      name: c.name ?? null,
      email: c.email ?? null,
      marketingOptIn: optIn,
      optInAt: optIn ? new Date() : null,
      lastOrderAt: new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

async function book(
  tx: Tx,
  e: { customerId: string; orderId: string | null; kind: "EARN" | "REDEEM" | "REVERSE_EARN" | "RETURN_REDEEM"; points: number; note: string },
): Promise<boolean> {
  if (e.points === 0) return false;
  try {
    await tx.loyaltyEvent.create({ data: e });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // already booked
    throw err;
  }
  await tx.customer.update({ where: { id: e.customerId }, data: { points: { increment: e.points } } });
  return true;
}

export async function reconcileLoyalty(orderId: string): Promise<void> {
  const s = await getSettings();
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      onlineConfirmationCode: true,
      status: true,
      customerId: true,
      pointsRedeemed: true,
      subtotal: true,
      discountAmount: true,
      loyaltyEvents: { select: { kind: true, points: true } },
    },
  });
  if (!o?.customerId) return;
  const has = (k: string) => o.loyaltyEvents.find((e) => e.kind === k);
  const label = o.onlineConfirmationCode ?? `#${o.orderNumber}`;
  const customerId = o.customerId;

  // Retried as a unit so a crash never leaves points half-booked.
  await prisma.$transaction(async (tx) => {
    const live = o.status === "SENT" || o.status === "READY" || o.status === "COMPLETED";
    if (live && o.pointsRedeemed > 0 && !has("REDEEM")) {
      await book(tx, { customerId, orderId: o.id, kind: "REDEEM", points: -o.pointsRedeemed, note: `Reward used on ${label}` });
    }
    if (o.status === "COMPLETED" && !has("EARN") && s.loyaltyEnabled) {
      const pts = pointsEarned(Number(o.subtotal) - Number(o.discountAmount), s.loyaltyPointsPerDollar);
      await book(tx, { customerId, orderId: o.id, kind: "EARN", points: pts, note: `Earned on ${label}` });
    }
    if (o.status === "VOIDED") {
      const red = has("REDEEM");
      if (red && !has("RETURN_REDEEM")) {
        await book(tx, { customerId, orderId: o.id, kind: "RETURN_REDEEM", points: -red.points, note: `${label} cancelled: reward returned` });
      }
      const earn = has("EARN");
      if (earn && !has("REVERSE_EARN")) {
        await book(tx, { customerId, orderId: o.id, kind: "REVERSE_EARN", points: -earn.points, note: `${label} cancelled` });
      }
    }
  });
  // Never let a balance show below zero (e.g. reward spent, then the earning order was cancelled).
  await prisma.customer.updateMany({ where: { id: customerId, points: { lt: 0 } }, data: { points: 0 } });
}

export async function adjustPoints(customerId: string, delta: number, note: string, staffId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.loyaltyEvent.create({ data: { customerId, kind: "ADJUST", points: delta, note, staffId } });
    await tx.customer.update({ where: { id: customerId }, data: { points: { increment: delta } } });
  });
  await prisma.customer.updateMany({ where: { id: customerId, points: { lt: 0 } }, data: { points: 0 } });
}
