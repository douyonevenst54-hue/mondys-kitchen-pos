"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession, getStaffFromSession } from "@/lib/staff";
import { checkManagerPin } from "@/lib/manager-pin";
import { getSettings } from "@/lib/menu";
import { weekdayIn, withDay, isOrderable } from "@/lib/menu-visibility";
import { barcodeVariants, canonicalBarcode } from "@/lib/barcode";

/**
 * Barcode scanning at the register. Looking a code up is for any signed-in
 * staff; linking a code, creating an item, or putting a hidden item back on
 * the register needs a manager (signed in, or their PIN typed on the spot).
 */

export type ScanItem = { id: string; name: string; price: number; hasOptions: boolean };
export type ScanLookup =
  | { status: "unknown"; code: string }
  | { status: "hidden"; code: string; item: ScanItem; reason: string }
  | { status: "ok"; code: string; item: ScanItem };

const itemSelect = {
  id: true,
  name: true,
  price: true,
  isActive: true,
  isAvailable: true,
  portionsLeft: true,
  showOnRegister: true,
  showOnline: true,
  serveDays: true,
  _count: { select: { modifierGroups: true } },
} as const;

export async function lookUpBarcode(raw: string): Promise<ScanLookup | { status: "error"; error: string }> {
  if (!(await getStaffFromSession())) return { status: "error", error: "Sign in again" };
  const code = canonicalBarcode(typeof raw === "string" ? raw : "");
  if (!code) return { status: "error", error: "That doesn't look like a barcode" };
  const item = await prisma.menuItem.findFirst({ where: { barcode: { in: barcodeVariants(code) } }, select: itemSelect });
  if (!item || !item.isActive) return { status: "unknown", code };
  const s = await getSettings();
  const weekday = weekdayIn(s.timezone);
  const out: ScanItem = { id: item.id, name: item.name, price: Number(item.price), hasOptions: item._count.modifierGroups > 0 };
  if (!isOrderable(item, "register", weekday)) {
    const reason = !item.showOnRegister
      ? "It's hidden from the register."
      : !(item.isAvailable && (item.portionsLeft === null || item.portionsLeft > 0))
        ? "It's marked sold out."
        : Number(item.price) <= 0
          ? "It has no price yet."
          : "It's not on today's schedule.";
    return { status: "hidden", code, item: out, reason };
  }
  return { status: "ok", code, item: out };
}

async function requireManager(pin: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await getManagerFromSession()) return { ok: true };
  const staff = await getStaffFromSession();
  if (!staff) return { ok: false, error: "Sign in again" };
  if (!pin) return { ok: false, error: "A manager PIN is needed" };
  const m = await checkManagerPin(pin, staff.id);
  return m.ok ? { ok: true } : { ok: false, error: m.error };
}

type Done = { ok: true; item: ScanItem } | { ok: false; error: string };

function refresh() {
  revalidatePath("/");
  revalidatePath("/menu/barcodes");
  revalidatePath("/menu/today");
}

/** Make an item sellable on the register today (shown, on schedule, not sold out). */
async function putOnRegister(itemId: string) {
  const s = await getSettings();
  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { serveDays: true } });
  if (!item) return;
  await prisma.menuItem.update({
    where: { id: itemId },
    data: { showOnRegister: true, isAvailable: true, serveDays: withDay(item.serveDays, weekdayIn(s.timezone), true) },
  });
  await prisma.menuItem.updateMany({ where: { id: itemId, portionsLeft: { lte: 0 } }, data: { portionsLeft: null } });
}

/** `sellNow`: from the register, also put the item on today's register menu. */
export async function linkBarcode(raw: string, itemId: string, pin: string | null, sellNow = true): Promise<Done> {
  const auth = await requireManager(pin);
  if (!auth.ok) return auth;
  const code = canonicalBarcode(raw);
  if (!code || typeof itemId !== "string") return { ok: false, error: "Scan the barcode again" };
  const other = await prisma.menuItem.findFirst({ where: { barcode: { in: barcodeVariants(code) } }, select: { id: true, name: true } });
  if (other && other.id !== itemId) return { ok: false, error: `That barcode already belongs to ${other.name}. Remove it there first.` };
  const item = await prisma.menuItem.update({
    where: { id: itemId },
    data: { barcode: code },
    select: { id: true, name: true, price: true, _count: { select: { modifierGroups: true } } },
  });
  if (sellNow === true) await putOnRegister(item.id);
  refresh();
  return { ok: true, item: { id: item.id, name: item.name, price: Number(item.price), hasOptions: item._count.modifierGroups > 0 } };
}

const NewItem = z.object({
  name: z.string().trim().min(2, "Type the item's name").max(60),
  price: z.number().positive("Type the price").max(1000),
  categoryId: z.string().min(1, "Pick a section").max(64),
  online: z.boolean().default(false),
});

export async function createBarcodeItem(raw: string, input: z.input<typeof NewItem>, pin: string | null): Promise<Done> {
  const auth = await requireManager(pin);
  if (!auth.ok) return auth;
  const code = canonicalBarcode(raw);
  if (!code) return { ok: false, error: "Scan the barcode again" };
  const p = NewItem.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the item" };
  const taken = await prisma.menuItem.findFirst({ where: { barcode: { in: barcodeVariants(code) } }, select: { name: true } });
  if (taken) return { ok: false, error: `That barcode already belongs to ${taken.name}.` };
  const last = await prisma.menuItem.findFirst({ where: { categoryId: p.data.categoryId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const item = await prisma.menuItem.create({
    data: {
      name: p.data.name,
      price: p.data.price,
      categoryId: p.data.categoryId,
      barcode: code,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      showOnRegister: true,
      showOnline: p.data.online,
      serveDays: 127,
    },
    select: { id: true, name: true, price: true },
  });
  refresh();
  if (p.data.online) revalidatePath("/order");
  return { ok: true, item: { id: item.id, name: item.name, price: Number(item.price), hasOptions: false } };
}

export async function showScannedItem(itemId: string, pin: string | null): Promise<Done> {
  const auth = await requireManager(pin);
  if (!auth.ok) return auth;
  if (typeof itemId !== "string" || itemId.length > 64) return { ok: false, error: "Invalid item" };
  await putOnRegister(itemId);
  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { id: true, name: true, price: true, _count: { select: { modifierGroups: true } } } });
  if (!item) return { ok: false, error: "Item not found" };
  if (Number(item.price) <= 0) return { ok: false, error: `${item.name} has no price yet. Set it on the Prices screen.` };
  refresh();
  return { ok: true, item: { id: item.id, name: item.name, price: Number(item.price), hasOptions: item._count.modifierGroups > 0 } };
}

export async function removeBarcode(itemId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof itemId !== "string" || itemId.length > 64) return { ok: false, error: "Invalid item" };
  await prisma.menuItem.update({ where: { id: itemId }, data: { barcode: null } });
  refresh();
  return { ok: true };
}

/** Items to link a code to (everything active, hidden ones too), for the picker. */
export async function searchItemsForBarcode(q: string): Promise<{ id: string; name: string; price: number; section: string; barcode: string | null }[]> {
  if (!(await getStaffFromSession())) return [];
  const term = (typeof q === "string" ? q : "").trim().slice(0, 40);
  const rows = await prisma.menuItem.findMany({
    where: { isActive: true, ...(term ? { name: { contains: term, mode: "insensitive" as const } } : {}) },
    orderBy: { name: "asc" },
    take: 12,
    select: { id: true, name: true, price: true, barcode: true, category: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, price: Number(r.price), section: r.category.name, barcode: r.barcode }));
}
