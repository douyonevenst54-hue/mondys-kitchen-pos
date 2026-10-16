import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";

/**
 * Kitchen display. Every order that needs cooking shows as a ticket until
 * the cook bumps it:
 *  - register orders (paid at the counter, so already COMPLETED) from the
 *    last few hours that haven't been bumped
 *  - online orders that are in (SENT). Scheduled ones appear a little before
 *    their pickup time, so the kitchen isn't cooking a 6 PM order at noon.
 * Bumping an online order also marks it ready for the customer.
 */

const POS_WINDOW_HOURS = 6;
/** A scheduled order shows up this long before its pickup time, on top of prep time. */
const SCHEDULED_LEAD_MINUTES = 15;

export type KitchenItem = {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  done: boolean;
};

export type KitchenTicket = {
  id: string;
  label: string; // "#1042" or "MK-482913"
  source: "register" | "online";
  type: "Dine-in" | "Takeout" | "Delivery" | "Online pickup";
  table: string | null;
  customerName: string | null;
  notes: string | null;
  receivedAt: string; // ISO
  dueAt: string | null; // scheduled pickup or promised time
  scheduled: boolean;
  started: boolean;
  items: KitchenItem[];
};

export type KitchenBoard = {
  tickets: KitchenTicket[];
  /** Scheduled online orders for later today, not on the screen yet. */
  upcoming: { count: number; next: string | null };
  recall: { id: string; label: string } | null;
  serverNow: string;
};

const TYPE_LABEL = { DINE_IN: "Dine-in", TAKEOUT: "Takeout", DELIVERY: "Delivery" } as const;

export async function getKitchenBoard(): Promise<KitchenBoard> {
  const settings = await getSettings();
  const now = new Date();
  const since = new Date(now.getTime() - POS_WINDOW_HOURS * 3_600_000);
  const leadMs = (settings.onlinePrepTimeMinutes + SCHEDULED_LEAD_MINUTES) * 60_000;
  const endOfToday = new Date(now.getTime() + 24 * 3_600_000);

  const rows = await prisma.order.findMany({
    where: {
      kitchenDoneAt: null,
      OR: [
        { source: "POS", status: { in: ["SENT", "READY", "COMPLETED"] }, createdAt: { gte: since } },
        { source: "ONLINE_PICKUP", status: "SENT" },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: {
      id: true,
      orderNumber: true,
      onlineConfirmationCode: true,
      source: true,
      orderType: true,
      customerName: true,
      notes: true,
      deliveryNotes: true,
      createdAt: true,
      estimatedReadyAt: true,
      scheduledPickupAt: true,
      kitchenStartedAt: true,
      table: { select: { number: true, label: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: { id: true, nameSnapshot: true, quantity: true, notes: true, kitchenDoneAt: true },
      },
    },
  });

  let upcomingCount = 0;
  let upcomingNext: Date | null = null;
  const tickets: KitchenTicket[] = [];
  for (const o of rows) {
    const sched = o.scheduledPickupAt;
    if (sched && sched.getTime() - leadMs > now.getTime()) {
      if (sched < endOfToday) {
        upcomingCount++;
        if (!upcomingNext || sched < upcomingNext) upcomingNext = sched;
      }
      continue;
    }
    const online = o.source === "ONLINE_PICKUP";
    tickets.push({
      id: o.id,
      label: online ? (o.onlineConfirmationCode ?? `#${o.orderNumber}`) : `#${o.orderNumber}`,
      source: online ? "online" : "register",
      type: online ? "Online pickup" : TYPE_LABEL[o.orderType],
      table: o.table ? (o.table.label ?? `Table ${o.table.number}`) : null,
      customerName: o.customerName,
      notes: [o.notes, o.deliveryNotes].filter(Boolean).join(" · ") || null,
      receivedAt: o.createdAt.toISOString(),
      dueAt: (sched ?? (online ? o.estimatedReadyAt : null))?.toISOString() ?? null,
      scheduled: Boolean(sched),
      started: Boolean(o.kitchenStartedAt),
      items: o.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        quantity: i.quantity,
        notes: i.notes,
        done: Boolean(i.kitchenDoneAt),
      })),
    });
  }
  // Most urgent first: the promised time if there is one, else when it came in.
  const prepMs = settings.onlinePrepTimeMinutes * 60_000;
  const urgency = (t: KitchenTicket) => (t.dueAt ? new Date(t.dueAt).getTime() : new Date(t.receivedAt).getTime() + prepMs);
  tickets.sort((a, b) => urgency(a) - urgency(b));

  const last = await prisma.order.findFirst({
    where: { kitchenDoneAt: { gte: new Date(now.getTime() - 15 * 60_000) }, status: { not: "VOIDED" } },
    orderBy: { kitchenDoneAt: "desc" },
    select: { id: true, orderNumber: true, onlineConfirmationCode: true, source: true },
  });

  return {
    tickets,
    upcoming: { count: upcomingCount, next: upcomingNext?.toISOString() ?? null },
    recall: last
      ? {
          id: last.id,
          label: last.source === "ONLINE_PICKUP" ? (last.onlineConfirmationCode ?? `#${last.orderNumber}`) : `#${last.orderNumber}`,
        }
      : null,
    serverNow: now.toISOString(),
  };
}

export async function startTicket(orderId: string): Promise<void> {
  await prisma.order.updateMany({ where: { id: orderId, kitchenStartedAt: null }, data: { kitchenStartedAt: new Date() } });
}

export async function toggleKitchenItem(itemId: string): Promise<void> {
  const item = await prisma.orderItem.findUnique({ where: { id: itemId }, select: { kitchenDoneAt: true } });
  if (!item) return;
  await prisma.orderItem.update({ where: { id: itemId }, data: { kitchenDoneAt: item.kitchenDoneAt ? null : new Date() } });
}

/** Done cooking. Online orders become "Ready for pickup" for the customer too. */
export async function bumpTicket(orderId: string): Promise<{ becameReady: boolean }> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { id: orderId, kitchenDoneAt: null }, data: { kitchenDoneAt: now } });
    const ready = await tx.order.updateMany({
      where: { id: orderId, source: "ONLINE_PICKUP", status: "SENT" },
      data: { status: "READY" },
    });
    return { becameReady: ready.count > 0 };
  });
}

/** Undo a bump (put the ticket back on the screen). */
export async function recallTicket(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { id: orderId }, data: { kitchenDoneAt: null } });
    // Not picked up yet: back to "being made" for the customer as well.
    await tx.order.updateMany({ where: { id: orderId, source: "ONLINE_PICKUP", status: "READY" }, data: { status: "SENT" } });
  });
}
