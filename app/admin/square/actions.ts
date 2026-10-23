"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { SquareError, createDeviceCode, getDeviceCode, squareStatus } from "@/lib/square";
import { getBrand } from "@/lib/brand";

/** Which Square Terminal: the one at the register, or the self-checkout one. */
export type TerminalTarget = "register" | "kiosk";

type Result = { ok: true } | { ok: false; error: string };

const isTarget = (t: unknown): t is TerminalTarget => t === "register" || t === "kiosk";

async function save(target: TerminalTarget, deviceId: string | null, name: string | null) {
  const id = (await prisma.restaurantSettings.findFirst({ select: { id: true } }))?.id;
  if (!id) return false;
  await prisma.restaurantSettings.update({
    where: { id },
    data: target === "register" ? { registerSquareDeviceId: deviceId, registerSquareDeviceName: name } : { squareDeviceId: deviceId, squareDeviceName: name },
  });
  revalidatePath("/admin/square");
  revalidatePath("/admin/self-checkout");
  revalidatePath("/kiosk");
  revalidatePath("/online");
  return true;
}

/** Step 1 of pairing: a code to type on the Square Terminal (valid 5 minutes). */
export async function startSquarePairing(target: TerminalTarget): Promise<{ ok: true; codeId: string; code: string } | { ok: false; error: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (!isTarget(target)) return { ok: false, error: "Invalid request" };
  const st = squareStatus();
  if (!st.enabled) return { ok: false, error: `Square isn't set up: ${st.problem}` };
  try {
    const where = target === "register" ? "register" : "self-checkout";
    const dc = await createDeviceCode(`${(await getBrand()).wordmark} ${where}`);
    return { ok: true, codeId: dc.id, code: dc.code };
  } catch (e) {
    return { ok: false, error: e instanceof SquareError ? e.message : "Couldn't reach Square. Try again." };
  }
}

/** Step 2: check whether the Terminal accepted the code; save it when it did. */
export async function checkSquarePairing(
  codeId: string,
  target: TerminalTarget,
): Promise<{ ok: true; paired: boolean; expired?: boolean } | { ok: false; error: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof codeId !== "string" || codeId.length > 100 || !isTarget(target)) return { ok: false, error: "Invalid code" };
  try {
    const dc = await getDeviceCode(codeId);
    if (dc.status === "PAIRED" && dc.device_id) {
      await save(target, dc.device_id, dc.name ?? "Square Terminal");
      return { ok: true, paired: true };
    }
    return { ok: true, paired: false, expired: dc.status === "EXPIRED" };
  } catch (e) {
    return { ok: false, error: e instanceof SquareError ? e.message : "Couldn't reach Square." };
  }
}

/** Sandbox has no pairing: type one of Square's test device ids instead. */
export async function setSquareDeviceManually(deviceId: string, target: TerminalTarget): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (!isTarget(target)) return { ok: false, error: "Invalid request" };
  const v = (deviceId ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{6,80}$/.test(v)) return { ok: false, error: "That doesn't look like a device id" };
  return (await save(target, v, "Square Terminal")) ? { ok: true } : { ok: false, error: "Settings not found" };
}

export async function unpairSquare(target: TerminalTarget): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (!isTarget(target)) return { ok: false, error: "Invalid request" };
  await save(target, null, null);
  return { ok: true };
}
