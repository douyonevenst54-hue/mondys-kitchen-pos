"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/session";

const PinSchema = z.object({
  pin: z
    .string()
    .min(4, "PIN must be at least 4 digits")
    .max(8, "PIN too long")
    .regex(/^\d+$/, "PIN must be digits only"),
});

export type PinLoginResult = { ok: true } | { ok: false; error: string };

async function setSessionCookie(
  staffId: string,
  name: string,
  role: string,
  hasOpenShift: boolean,
  iat?: number, // keep the original login time when re-issuing
) {
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    await signSession({ staffId, name, role, hasOpenShift, iat }),
    sessionCookieOptions(),
  );
}

/**
 * Re-issue the session cookie with an updated hasOpenShift flag. Called
 * after openShift / closeShift server actions so subsequent navigation
 * sees the updated state without a full re-login.
 */
export async function refreshSessionShiftState(hasOpenShift: boolean) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("mondy_session")?.value;
  const session = await verifySession(raw);
  if (!session) return;
  await setSessionCookie(
    session.staffId,
    session.name,
    session.role,
    hasOpenShift,
    session.iat,
  );
}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function throttleKey(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

export async function loginWithPin(formData: FormData): Promise<PinLoginResult> {
  const parsed = PinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid PIN" };
  }

  const { pin } = parsed.data;

  // Stop PIN guessing: after 5 wrong tries from one device, wait 15 minutes.
  const key = await throttleKey();
  const throttle = await prisma.loginThrottle.findUnique({ where: { key } });
  if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) {
    const mins = Math.ceil((throttle.lockedUntil.getTime() - Date.now()) / 60_000);
    return {
      ok: false,
      error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const activeStaff = await prisma.staff.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, pinHash: true },
  });

  let matched: { id: string; name: string; role: string } | null = null;
  for (const s of activeStaff) {
    if (await bcrypt.compare(pin, s.pinHash)) {
      matched = { id: s.id, name: s.name, role: s.role };
      break;
    }
  }

  if (!matched) {
    const failures = (throttle?.failures ?? 0) + 1;
    const lock = failures >= MAX_FAILURES;
    await prisma.loginThrottle.upsert({
      where: { key },
      create: { key, failures: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      update: { failures: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    return {
      ok: false,
      error: lock
        ? `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`
        : "Incorrect PIN",
    };
  }

  await prisma.loginThrottle.deleteMany({ where: { key } });

  // Check shift status server-side so we know where to send them.
  const openShift = await prisma.shift.findFirst({
    where: { staffId: matched.id, endedAt: null },
    select: { id: true },
  });

  await setSessionCookie(
    matched.id,
    matched.name,
    matched.role,
    Boolean(openShift),
  );

  // CASHIER without an open shift → force them through the open-shift flow.
  // Managers/owners can skip and go straight to the home page.
  if (matched.role === "CASHIER" && !openShift) {
    redirect("/shift/open");
  }

  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("mondy_session");
  redirect("/login");
}