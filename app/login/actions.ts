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

export type PinLoginResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verify a staff PIN and create a session.
 *
 * Security notes:
 * - PINs are bcrypt-hashed in DB; we iterate over active staff and compare.
 *   This is acceptable for a small staff (≤50). For larger scale we'd add
 *   a non-hashed staffId hint or use a different scheme.
 * - Failed attempts are NOT rate-limited yet; add this before going live.
 * - Session cookie is httpOnly + sameSite=lax. For a self-hosted POS on a
 *   trusted LAN this is sufficient; we'll add CSRF protection at checkout.
 */
export async function loginWithPin(formData: FormData): Promise<PinLoginResult> {
  const parsed = PinSchema.safeParse({ pin: formData.get("pin") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid PIN" };
  }

  const { pin } = parsed.data;

  // Pull only active staff. Small list, so iterating to bcrypt-compare is fine.
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

  // Minimal session — just enough to identify the user.
  // Phase 2 will move to NextAuth for proper session signing.
  const cookieStore = await cookies();
  cookieStore.set(
    "mondy_session",
    JSON.stringify({ staffId: matched.id, name: matched.name, role: matched.role }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours — covers a full shift
    },
  );

  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("mondy_session");
  redirect("/login");
}