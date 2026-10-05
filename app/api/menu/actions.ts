"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";

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
  revalidatePath("/menu/availability");

  return { ok: true, itemId: item.id, isAvailable: parsed.data.isAvailable };
}
