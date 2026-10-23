"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { queueTestPrint } from "@/lib/print-queue";
import { getBrand } from "@/lib/brand";

type Result = { ok: true } | { ok: false; error: string };

async function settingsId() {
  return (await prisma.restaurantSettings.findFirst({ select: { id: true } }))?.id ?? null;
}

export async function setKioskOptions(input: { payment: string; autoPrint: boolean }): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (!["square", "stripe", "counter"].includes(input.payment)) return { ok: false, error: "Pick a payment option" };
  const id = await settingsId();
  if (!id) return { ok: false, error: "Settings not found" };
  await prisma.restaurantSettings.update({ where: { id }, data: { kioskPayment: input.payment, kioskAutoPrint: input.autoPrint === true } });
  revalidatePath("/admin/self-checkout");
  revalidatePath("/kiosk");
  return { ok: true };
}

export async function testPrint(): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  await queueTestPrint((await getBrand()).name);
  return { ok: true };
}
