"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
) {
  const cookieStore = await cookies();
  cookieStore.set(
    "mondy_session",
    JSON.stringify({ staffId, name, role, hasOpenShift }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours — covers a full shift
    },
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
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as {
      staffId: string;
      name: string;
      role: string;
    };
    await setSessionCookie(
      session.staffId,
      session.name,
      session.role,
      hasOpenShift,
    );
  } catch {
    // Corrupted; ignore
  }
}

export async function loginWithPin(formData: FormData): Promise<PinLoginResult> {
  const parsed = PinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid PIN" };
  }

  const { pin } = parsed.data;

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
    return { ok: false, error: "Incorrect PIN" };
  }

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