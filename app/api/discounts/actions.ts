"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
