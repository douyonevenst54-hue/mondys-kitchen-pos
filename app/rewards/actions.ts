"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { adjustPoints } from "@/lib/loyalty";
import { optOut } from "@/lib/campaigns";

type Result = { ok: true } | { ok: false; error: string };

const SettingsSchema = z.object({
  enabled: z.boolean(),
  pointsPerDollar: z.number().int().min(1).max(20),
  rewardPoints: z.number().int().min(10).max(10_000),
  rewardValue: z.number().min(1).max(100),
});

export async function saveLoyaltySettings(input: z.input<typeof SettingsSchema>): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  const p = SettingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Check the numbers" };
  const s = await prisma.restaurantSettings.findFirst({ select: { id: true } });
  if (!s) return { ok: false, error: "Settings not found" };
  await prisma.restaurantSettings.update({
    where: { id: s.id },
    data: {
      loyaltyEnabled: p.data.enabled,
      loyaltyPointsPerDollar: p.data.pointsPerDollar,
      loyaltyRewardPoints: p.data.rewardPoints,
      loyaltyRewardValue: p.data.rewardValue,
    },
  });
  revalidatePath("/rewards");
  revalidatePath("/order");
  return { ok: true };
}

export async function adjustCustomerPoints(customerId: string, delta: number, note: string): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Sign in as a manager" };
  const p = z
    .object({ id: z.string().min(1).max(64), delta: z.number().int().min(-10_000).max(10_000).refine((v) => v !== 0), note: z.string().trim().min(3).max(120) })
    .safeParse({ id: customerId, delta, note });
  if (!p.success) return { ok: false, error: "Enter the points (+ or −) and a reason" };
  await adjustPoints(p.data.id, p.data.delta, `${p.data.note} (by ${manager.name})`, manager.id);
  revalidatePath("/rewards");
  return { ok: true };
}

export async function stopCustomerEmails(customerId: string): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof customerId !== "string" || customerId.length > 64) return { ok: false, error: "Invalid customer" };
  await optOut(customerId);
  revalidatePath("/rewards");
  return { ok: true };
}
