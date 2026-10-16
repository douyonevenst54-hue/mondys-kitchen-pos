"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting";

type Result = { ok: true } | { ok: false; error: string };

/** Percent typed on screen, e.g. 7 or 6.25. */
export async function saveTaxRate(percent: number): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Sign in as a manager" };
  const p = z.number().min(0).max(20).safeParse(percent);
  if (!p.success) return { ok: false, error: "Enter a rate between 0% and 20%" };
  const settings = await prisma.restaurantSettings.findFirst({ select: { id: true } });
  if (!settings) return { ok: false, error: "Settings not found" };
  await prisma.restaurantSettings.update({
    where: { id: settings.id },
    data: { taxRate: Math.round(p.data * 100) / 10000 },
  });
  for (const path of ["/", "/order", "/reports/accounting", "/reports/daily"]) revalidatePath(path);
  return { ok: true };
}

const AccountsSchema = z.object(
  Object.fromEntries(Object.keys(DEFAULT_ACCOUNTS).map((k) => [k, z.string().trim().min(1, "Account names can't be empty").max(100)])),
);

export async function saveAccounts(input: Record<string, string>): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Sign in as a manager" };
  const parsed = AccountsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the account names" };
  const settings = await prisma.restaurantSettings.findFirst({ select: { id: true } });
  if (!settings) return { ok: false, error: "Settings not found" };
  await prisma.restaurantSettings.update({ where: { id: settings.id }, data: { accountingAccounts: parsed.data } });
  revalidatePath("/reports/accounting");
  return { ok: true };
}
