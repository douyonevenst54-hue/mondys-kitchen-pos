"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { SquareError, createDeviceCode, getDeviceCode, squareStatus } from "@/lib/square";
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

/** Step 1 of pairing: a code to type on the Square Terminal (valid 5 minutes). */
export async function startSquarePairing(): Promise<{ ok: true; codeId: string; code: string } | { ok: false; error: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  const st = squareStatus();
  if (!st.enabled) return { ok: false, error: `Square isn't set up: ${st.problem}` };
  try {
    const dc = await createDeviceCode(`${(await getBrand()).wordmark} self-checkout`);
    return { ok: true, codeId: dc.id, code: dc.code };
  } catch (e) {
    return { ok: false, error: e instanceof SquareError ? e.message : "Couldn't reach Square. Try again." };
  }
}

/** Step 2: check whether the Terminal accepted the code; save it when it did. */
export async function checkSquarePairing(codeId: string): Promise<{ ok: true; paired: boolean; expired?: boolean } | { ok: false; error: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof codeId !== "string" || codeId.length > 100) return { ok: false, error: "Invalid code" };
  try {
    const dc = await getDeviceCode(codeId);
    if (dc.status === "PAIRED" && dc.device_id) {
      const id = await settingsId();
      if (id) await prisma.restaurantSettings.update({ where: { id }, data: { squareDeviceId: dc.device_id, squareDeviceName: dc.name ?? "Square Terminal" } });
      revalidatePath("/admin/self-checkout");
      return { ok: true, paired: true };
    }
    return { ok: true, paired: false, expired: dc.status === "EXPIRED" };
  } catch (e) {
    return { ok: false, error: e instanceof SquareError ? e.message : "Couldn't reach Square." };
  }
}

/** Sandbox has no pairing: type one of Square's test device ids instead. */
export async function setSquareDeviceManually(deviceId: string): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  const v = (deviceId ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{6,80}$/.test(v)) return { ok: false, error: "That doesn't look like a device id" };
  const id = await settingsId();
  if (!id) return { ok: false, error: "Settings not found" };
  await prisma.restaurantSettings.update({ where: { id }, data: { squareDeviceId: v, squareDeviceName: "Square Terminal" } });
  revalidatePath("/admin/self-checkout");
  return { ok: true };
}

export async function unpairSquare(): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  const id = await settingsId();
  if (id) await prisma.restaurantSettings.update({ where: { id }, data: { squareDeviceId: null, squareDeviceName: null } });
  revalidatePath("/admin/self-checkout");
  return { ok: true };
}

export async function testPrint(): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  await queueTestPrint((await getBrand()).name);
  return { ok: true };
}
