import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/business-date";

type Tx = Prisma.TransactionClient;

export class PortionError extends Error {}

async function restaurantTimezone(tx: Tx): Promise<string> {
  const s = await tx.restaurantSettings.findFirst({ select: { timezone: true } });
  return s?.timezone ?? "America/New_York";
}

/**
 * Atomically subtract portions. The conditional updateMany locks the row until
 * the transaction ends, so two registers can't sell the last plate twice.
 * Returns the new balance, or throws PortionError if there isn't enough.
 */
async function takePortions(
  tx: Tx,
  item: { id: string; name: string },
  quantity: number,
): Promise<number> {
  const res = await tx.menuItem.updateMany({
    where: { id: item.id, portionsLeft: { gte: quantity } },
    data: { portionsLeft: { decrement: quantity } },
  });
  const after = await tx.menuItem.findUnique({
    where: { id: item.id },
    select: { portionsLeft: true },
  });
  if (res.count === 0) {
    const left = after?.portionsLeft ?? 0;
    throw new PortionError(
      left === 0
        ? `${item.name} is sold out`
        : `Only ${left} ${item.name} left`,
    );
  }
  const balance = after?.portionsLeft ?? 0;
  if (balance === 0) {
    await tx.menuItem.update({
      where: { id: item.id },
      data: { isAvailable: false },
    });
  }
  return balance;
}

/** Called inside the checkout transaction, after the order row exists. */
export async function sellPortions(
  tx: Tx,
  lines: { menuItemId: string; quantity: number }[],
  staffId: string,
  orderId: string,
): Promise<void> {
  const qtyByItem = new Map<string, number>();
  for (const l of lines) {
    qtyByItem.set(l.menuItemId, (qtyByItem.get(l.menuItemId) ?? 0) + l.quantity);
  }

  const counted = await tx.menuItem.findMany({
    where: { id: { in: [...qtyByItem.keys()] }, portionsLeft: { not: null } },
    select: { id: true, name: true },
  });
  if (counted.length === 0) return;

  const date = businessDate(await restaurantTimezone(tx));
  for (const item of counted) {
    const qty = qtyByItem.get(item.id)!;
    const balance = await takePortions(tx, item, qty);
    await tx.portionEvent.create({
      data: {
        menuItemId: item.id,
        businessDate: date,
        type: "SALE",
        change: -qty,
        balanceAfter: balance,
        staffId,
        orderId,
      },
    });
  }
}

/**
 * Called inside the void transaction: puts back every portion this order took.
 * If the food was already thrown out, a manager records that with Remove.
 */
export async function returnPortionsForOrder(
  tx: Tx,
  orderId: string,
  staffId: string,
): Promise<void> {
  const sales = await tx.portionEvent.findMany({
    where: { orderId, type: "SALE" },
    select: { menuItemId: true, change: true },
  });
  if (sales.length === 0) return;

  const date = businessDate(await restaurantTimezone(tx));
  for (const s of sales) {
    const qty = -s.change;
    const updated = await tx.menuItem.update({
      where: { id: s.menuItemId },
      data: { portionsLeft: { increment: qty }, isAvailable: true },
      select: { portionsLeft: true },
    });
    await tx.portionEvent.create({
      data: {
        menuItemId: s.menuItemId,
        businessDate: date,
        type: "VOID",
        change: qty,
        balanceAfter: updated.portionsLeft ?? qty,
        reason: "Order voided",
        staffId,
        orderId,
      },
    });
  }
}

/** Manager entered a physical count. */
export async function recordCount(itemId: string, counted: number, staffId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({
      where: { id: itemId, isActive: true },
      select: { id: true, portionsLeft: true },
    });
    if (!item) throw new PortionError("Item not found");

    const expected = item.portionsLeft ?? 0;
    await tx.menuItem.update({
      where: { id: item.id },
      data: { portionsLeft: counted, isAvailable: counted > 0 },
    });
    await tx.portionEvent.create({
      data: {
        menuItemId: item.id,
        businessDate: businessDate(await restaurantTimezone(tx)),
        type: "COUNT",
        change: counted - expected,
        balanceAfter: counted,
        reason: item.portionsLeft === null ? "Started counting" : null,
        staffId,
      },
    });
    return counted;
  });
}

/** Manager added a fresh batch. Item must already be counted. */
export async function recordAdd(itemId: string, quantity: number, staffId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({
      where: { id: itemId, isActive: true },
      select: { id: true, portionsLeft: true },
    });
    if (!item) throw new PortionError("Item not found");
    if (item.portionsLeft === null) {
      throw new PortionError("Enter a count for this item first");
    }

    const updated = await tx.menuItem.update({
      where: { id: item.id },
      data: { portionsLeft: { increment: quantity }, isAvailable: true },
      select: { portionsLeft: true },
    });
    const balance = updated.portionsLeft ?? quantity;
    await tx.portionEvent.create({
      data: {
        menuItemId: item.id,
        businessDate: businessDate(await restaurantTimezone(tx)),
        type: "ADD",
        change: quantity,
        balanceAfter: balance,
        staffId,
      },
    });
    return balance;
  });
}

/** Manager removed portions (waste, staff meal, correction). */
export async function recordRemove(
  itemId: string,
  quantity: number,
  reason: string,
  staffId: string,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({
      where: { id: itemId, isActive: true },
      select: { id: true, name: true, portionsLeft: true },
    });
    if (!item) throw new PortionError("Item not found");
    if (item.portionsLeft === null) {
      throw new PortionError("This item isn't being counted");
    }

    const balance = await takePortions(tx, item, quantity);
    await tx.portionEvent.create({
      data: {
        menuItemId: item.id,
        businessDate: businessDate(await restaurantTimezone(tx)),
        type: "REMOVE",
        change: -quantity,
        balanceAfter: balance,
        reason,
        staffId,
      },
    });
    return balance;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Day audit
// ─────────────────────────────────────────────────────────────────────────────

export type PortionDayRow = {
  menuItemId: string;
  name: string;
  carriedIn: number;
  countChange: number;
  added: number;
  sold: number;
  removed: number;
  voidedBack: number;
  left: number;
};

export type PortionDayEvent = {
  id: string;
  at: Date;
  itemName: string;
  type: "COUNT" | "ADD" | "REMOVE" | "SALE" | "VOID";
  change: number;
  balanceAfter: number;
  reason: string | null;
  staffName: string;
  orderNumber: number | null;
};

export async function getPortionDay(date: string): Promise<{
  rows: PortionDayRow[];
  events: PortionDayEvent[];
}> {
  const events = await prisma.portionEvent.findMany({
    where: { businessDate: date },
    orderBy: { createdAt: "asc" },
    include: {
      menuItem: { select: { name: true } },
      staff: { select: { name: true } },
      order: { select: { orderNumber: true } },
    },
  });

  const rows = new Map<string, PortionDayRow>();
  for (const e of events) {
    let row = rows.get(e.menuItemId);
    if (!row) {
      // Balance before the day's first event = what carried in from before.
      row = {
        menuItemId: e.menuItemId,
        name: e.menuItem.name,
        carriedIn: e.balanceAfter - e.change,
        countChange: 0,
        added: 0,
        sold: 0,
        removed: 0,
        voidedBack: 0,
        left: 0,
      };
      rows.set(e.menuItemId, row);
    }
    if (e.type === "COUNT") row.countChange += e.change;
    if (e.type === "ADD") row.added += e.change;
    if (e.type === "SALE") row.sold += -e.change;
    if (e.type === "REMOVE") row.removed += -e.change;
    if (e.type === "VOID") row.voidedBack += e.change;
    row.left = e.balanceAfter;
  }

  return {
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    events: events.map((e) => ({
      id: e.id,
      at: e.createdAt,
      itemName: e.menuItem.name,
      type: e.type,
      change: e.change,
      balanceAfter: e.balanceAfter,
      reason: e.reason,
      staffName: e.staff.name,
      orderNumber: e.order?.orderNumber ?? null,
    })),
  };
}
