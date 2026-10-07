"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { servedOn, withDay } from "@/lib/menu-visibility";

const AvailabilitySchema = z.object({
  itemId: z.string().min(1),
  isAvailable: z.boolean(),
});

export type SetAvailabilityResult =
  | { ok: true; itemId: string; isAvailable: boolean }
  | { ok: false; error: string };

/**
 * Mark a menu item sold out (isAvailable = false) or back on the menu.
 * Owners and managers only; the role is checked against the database.
 */
export async function setItemAvailability(
  itemId: string,
  isAvailable: boolean,
): Promise<SetAvailabilityResult> {
  const parsed = AvailabilitySchema.safeParse({ itemId, isAvailable });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request" };
  }

  const manager = await getManagerFromSession();
  if (!manager) {
    return { ok: false, error: "Only an owner or manager can change this" };
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: parsed.data.itemId, isActive: true },
    select: { id: true },
  });
  if (!item) {
    return { ok: false, error: "Item not found" };
  }

  await prisma.menuItem.update({
    where: { id: item.id },
    data: { isAvailable: parsed.data.isAvailable },
  });

  // Cashier screen and this page both read isAvailable on the server.
  revalidatePath("/");
  revalidatePath("/order");
  revalidatePath("/menu/availability");
  revalidatePath("/menu/daily");

  return { ok: true, itemId: item.id, isAvailable: parsed.data.isAvailable };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily menu: show/hide per channel, weekly schedule, sold-out display
// ─────────────────────────────────────────────────────────────────────────────

type MenuResult = { ok: true } | { ok: false; error: string };

const Channel = z.enum(["register", "online"]);
const Weekday = z.number().int().min(0).max(6);
const Id = z.string().min(1).max(64);

function revalidateMenus() {
  revalidatePath("/");
  revalidatePath("/order");
  revalidatePath("/menu/daily");
  revalidatePath("/menu/availability");
}

async function managerOnly<T>(fn: () => Promise<T>): Promise<MenuResult> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can change the menu" };
  try {
    await fn();
    revalidateMenus();
    return { ok: true };
  } catch (e) {
    console.error("Menu change failed:", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/** Show or hide one dish on the register or the online order page. */
export async function setItemVisibility(
  itemId: string,
  channel: "register" | "online",
  visible: boolean,
): Promise<MenuResult> {
  const p = z.object({ itemId: Id, channel: Channel, visible: z.boolean() }).safeParse({ itemId, channel, visible });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(() =>
    prisma.menuItem.update({
      where: { id: p.data.itemId },
      data: p.data.channel === "register" ? { showOnRegister: p.data.visible } : { showOnline: p.data.visible },
    }),
  );
}

/** Show or hide every dish in a category on one channel. */
export async function setCategoryVisibility(
  categoryId: string,
  channel: "register" | "online",
  visible: boolean,
): Promise<MenuResult> {
  const p = z.object({ categoryId: Id, channel: Channel, visible: z.boolean() }).safeParse({ categoryId, channel, visible });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(() =>
    prisma.menuItem.updateMany({
      where: { categoryId: p.data.categoryId, isActive: true },
      data: p.data.channel === "register" ? { showOnRegister: p.data.visible } : { showOnline: p.data.visible },
    }),
  );
}

/** Put one dish on (or take it off) the schedule for a weekday. */
export async function setItemServedOn(itemId: string, weekday: number, served: boolean): Promise<MenuResult> {
  const p = z.object({ itemId: Id, weekday: Weekday, served: z.boolean() }).safeParse({ itemId, weekday, served });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(() =>
    prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.findUniqueOrThrow({ where: { id: p.data.itemId }, select: { serveDays: true } });
      await tx.menuItem.update({
        where: { id: p.data.itemId },
        data: { serveDays: withDay(item.serveDays, p.data.weekday, p.data.served) },
      });
    }),
  );
}

/** Put a whole category on (or off) the schedule for a weekday. */
export async function setCategoryServedOn(categoryId: string, weekday: number, served: boolean): Promise<MenuResult> {
  const p = z.object({ categoryId: Id, weekday: Weekday, served: z.boolean() }).safeParse({ categoryId, weekday, served });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(() =>
    prisma.$transaction(async (tx) => {
      const items = await tx.menuItem.findMany({
        where: { categoryId: p.data.categoryId, isActive: true },
        select: { id: true, serveDays: true },
      });
      for (const item of items) {
        const next = withDay(item.serveDays, p.data.weekday, p.data.served);
        if (next !== item.serveDays) {
          await tx.menuItem.update({ where: { id: item.id }, data: { serveDays: next } });
        }
      }
    }),
  );
}

/** Copy one day's schedule onto another day, for every dish. */
export async function copyDaySchedule(fromDay: number, toDay: number): Promise<MenuResult> {
  const p = z.object({ fromDay: Weekday, toDay: Weekday }).safeParse({ fromDay, toDay });
  if (!p.success || p.data.fromDay === p.data.toDay) return { ok: false, error: "Pick two different days" };
  return managerOnly(() =>
    prisma.$transaction(async (tx) => {
      const items = await tx.menuItem.findMany({ where: { isActive: true }, select: { id: true, serveDays: true } });
      for (const item of items) {
        const next = withDay(item.serveDays, p.data.toDay, servedOn(item.serveDays, p.data.fromDay));
        if (next !== item.serveDays) {
          await tx.menuItem.update({ where: { id: item.id }, data: { serveDays: next } });
        }
      }
    }),
  );
}

/** Whether sold-out dishes stay listed (marked sold out) or disappear. */
export async function setSoldOutDisplay(channel: "register" | "online", hide: boolean): Promise<MenuResult> {
  const p = z.object({ channel: Channel, hide: z.boolean() }).safeParse({ channel, hide });
  if (!p.success) return { ok: false, error: "Invalid request" };
  const data = p.data.channel === "register" ? { hideSoldOutOnRegister: p.data.hide } : { hideSoldOutOnline: p.data.hide };
  return managerOnly(async () => {
    const existing = await prisma.restaurantSettings.findFirst({ select: { id: true } });
    if (existing) {
      await prisma.restaurantSettings.update({ where: { id: existing.id }, data });
    } else {
      await prisma.restaurantSettings.create({ data });
    }
  });
}
