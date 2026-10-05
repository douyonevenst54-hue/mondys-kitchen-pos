"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

type Session = { staffId: string; name: string; role: string };

async function requireManagerOrOwner(): Promise<Session> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) throw new Error("Not signed in");
  const session = JSON.parse(raw) as Session;
  if (session.role !== "MANAGER" && session.role !== "OWNER") {
    throw new Error("Manager or owner required");
  }
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle online ordering paused
// ─────────────────────────────────────────────────────────────────────────────

export async function setOnlineOrderingPaused(paused: boolean) {
  await requireManagerOrOwner();
  const settings = await prisma.restaurantSettings.findFirst();
  if (!settings) {
    return { ok: false as const, error: "Settings not found" };
  }
  await prisma.restaurantSettings.update({
    where: { id: settings.id },
    data: { onlineOrderingPaused: paused },
  });
  revalidatePath("/admin/online-settings");
  revalidatePath("/menu");
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update business hours
//
// Shape: { monday: "11:00-21:00" | null, tuesday: ..., ... }
// "HH:MM-HH:MM" format with 24-hour time. null means closed that day.
// ─────────────────────────────────────────────────────────────────────────────

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const RANGE_FORMAT = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const HoursSchema = z.object(
  Object.fromEntries(
    DAYS.map((d) => [
      d,
      z
        .string()
        .regex(RANGE_FORMAT, `Use HH:MM-HH:MM format (e.g. 11:00-21:00)`)
        .nullable(),
    ]),
  ) as Record<(typeof DAYS)[number], z.ZodNullable<z.ZodString>>,
);

export async function setBusinessHours(
  hours: Record<string, string | null>,
) {
  await requireManagerOrOwner();

  const parsed = HoursSchema.safeParse(hours);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false as const, error: issues };
  }

  // Cross-check: close time must be after open time for any non-null day.
  for (const day of DAYS) {
    const range = parsed.data[day];
    if (range === null) continue;
    const [open, close] = range.split("-");
    if (close <= open) {
      return {
        ok: false as const,
        error: `${day}: closing time must be after opening time`,
      };
    }
  }

  const settings = await prisma.restaurantSettings.findFirst();
  if (!settings) {
    return { ok: false as const, error: "Settings not found" };
  }
  await prisma.restaurantSettings.update({
    where: { id: settings.id },
    data: { businessHours: parsed.data },
  });
  revalidatePath("/admin/online-settings");
  revalidatePath("/menu");
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update prep time estimate
// ─────────────────────────────────────────────────────────────────────────────

const PrepTimeSchema = z.number().int().min(5).max(120);

export async function setOnlinePrepTime(minutes: number) {
  await requireManagerOrOwner();

  const parsed = PrepTimeSchema.safeParse(minutes);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Prep time must be a whole number between 5 and 120 minutes",
    };
  }

  const settings = await prisma.restaurantSettings.findFirst();
  if (!settings) {
    return { ok: false as const, error: "Settings not found" };
  }
  await prisma.restaurantSettings.update({
    where: { id: settings.id },
    data: { onlinePrepTimeMinutes: parsed.data },
  });
  revalidatePath("/admin/online-settings");
  revalidatePath("/menu");
  return { ok: true as const };
}