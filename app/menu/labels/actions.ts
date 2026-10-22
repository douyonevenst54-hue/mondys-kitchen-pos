"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { storeCode } from "@/lib/ean13";
import { LABEL_SIZES } from "@/lib/labels";


/**
 * Give a dish made in house its own store barcode (EAN-13 starting with 21),
 * so its sticker can be scanned at the self-checkout and the register.
 */
export async function assignStoreBarcode(itemId: string): Promise<{ ok: true; barcode: string } | { ok: false; error: string }> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof itemId !== "string" || itemId.length > 64) return { ok: false, error: "Invalid item" };
  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { barcode: true, name: true } });
  if (!item) return { ok: false, error: "Item not found" };
  if (item.barcode) return { ok: true, barcode: item.barcode };
  // Next free number after the highest store code so far.
  const last = await prisma.menuItem.findFirst({
    where: { barcode: { startsWith: "21" } },
    orderBy: { barcode: "desc" },
    select: { barcode: true },
  });
  let n = last?.barcode && /^21\d{11}$/.test(last.barcode) ? Number(last.barcode.slice(2, 12)) + 1 : 1;
  for (let tries = 0; tries < 5; tries++, n++) {
    const code = storeCode(n);
    try {
      await prisma.menuItem.update({ where: { id: itemId }, data: { barcode: code } });
      revalidatePath("/menu/labels");
      revalidatePath("/menu/barcodes");
      revalidatePath("/");
      return { ok: true, barcode: code };
    } catch {
      // Taken at the same moment by another screen: try the next number.
    }
  }
  return { ok: false, error: "Couldn't create a barcode. Try again." };
}

export async function saveLabelSize(size: string): Promise<{ ok: boolean }> {
  if (!(await getManagerFromSession())) return { ok: false };
  if (!(size in LABEL_SIZES)) return { ok: false };
  const s = await prisma.restaurantSettings.findFirst({ select: { id: true } });
  if (s) await prisma.restaurantSettings.update({ where: { id: s.id }, data: { labelSize: size } });
  return { ok: true };
}
