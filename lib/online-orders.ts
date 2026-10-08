import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { getStripe, toCents } from "@/lib/stripe";
import { withUniqueConfirmationCode } from "@/lib/confirmation-code";
import { PortionError, sellPortions } from "@/lib/portions";
import { onlineOpenState } from "@/lib/online-hours";
import { isListed, isSoldOut, needsPrice, servedOn, weekdayIn } from "@/lib/menu-visibility";
import { checkSelection, type OptionGroup } from "@/lib/options";
import { loadOptionGroups, optionGroupsInclude, toOptionGroups } from "@/lib/options-db";

type Tx = Prisma.TransactionClient;

/** Orders paid at pickup above this total must be paid online (prank protection). */
export const PAY_AT_PICKUP_LIMIT = 60;
export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES = 30;
/** Show "only N left" online when a counted dish drops to this or below. */
export const LOW_STOCK_HINT = 5;


export class OnlineOrderError extends Error {}

// ─────────────────────────────────────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────────────────────────────────────

export type OnlineMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  soldOut: boolean;
  lowStock: number | null; // set when only a few portions remain
  menuNumber: number | null;
  isSignature: boolean;
  optionGroups: OptionGroup[];
};

export type OnlineMenuCategory = { id: string; name: string; items: OnlineMenuItem[] };

export async function getOnlineMenu(): Promise<OnlineMenuCategory[]> {
  const now = new Date();
  const settings = await getSettings();
  const weekday = weekdayIn(settings.timezone);
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      menuItems: {
        where: {
          isActive: true,
          OR: [{ availableUntil: null }, { availableUntil: { gt: now } }],
        },
        orderBy: { sortOrder: "asc" },
        include: optionGroupsInclude,
      },
    },
  });

  return categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.menuItems
        .filter((i) => isListed(i, "online", weekday, settings.hideSoldOutOnline))
        .map((i) => {
        const soldOut = isSoldOut(i);
        return {
          id: i.id,
          name: i.name,
          description: i.description,
          price: Number(i.price),
          soldOut,
          lowStock:
            !soldOut && i.portionsLeft !== null && i.portionsLeft <= LOW_STOCK_HINT
              ? i.portionsLeft
              : null,
          menuNumber: i.menuNumber,
          isSignature: i.isSignature,
          optionGroups: toOptionGroups(i.modifierGroups),
        };
      }),
    }))
    .filter((c) => c.items.length > 0);
}

export async function getOnlineStatus() {
  const settings = await getSettings();
  return {
    settings,
    state: onlineOpenState({
      paused: settings.onlineOrderingPaused,
      businessHours: settings.businessHours,
      timezone: settings.timezone,
      prepMinutes: settings.onlinePrepTimeMinutes,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing — always from the database, never from the browser
// ─────────────────────────────────────────────────────────────────────────────

export type CartLineInput = {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
};

type PricedLine = {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  nameSnapshot: string;
  lineTotal: number;
  notes: string | null;
  modifiers: { create: { modifierId: string; nameSnapshot: string; priceAtTime: number }[] };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

async function priceCart(lines: CartLineInput[], taxRate: number, timezone: string) {
  if (lines.length === 0) throw new OnlineOrderError("Your cart is empty");
  if (lines.length > MAX_LINES) throw new OnlineOrderError("That order is too large to place online. Please call us.");

  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids }, isActive: true, category: { isActive: true } },
    select: {
      id: true,
      name: true,
      price: true,
      isAvailable: true,
      portionsLeft: true,
      availableUntil: true,
      showOnline: true,
      serveDays: true,
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.menuItemId, (wanted.get(l.menuItemId) ?? 0) + l.quantity);

  const now = new Date();
  const weekday = weekdayIn(timezone);
  for (const [id, qty] of wanted) {
    const item = byId.get(id);
    if (item && (!item.showOnline || !servedOn(item.serveDays, weekday) || needsPrice(item))) {
      throw new OnlineOrderError(`${item.name} isn't on today's menu. Remove it to continue.`);
    }
    if (!item || !item.isAvailable || (item.availableUntil && item.availableUntil <= now)) {
      throw new OnlineOrderError(
        item ? `${item.name} just sold out. Remove it to continue.` : "An item in your cart is no longer on the menu.",
      );
    }
    if (item.portionsLeft !== null && item.portionsLeft < qty) {
      throw new OnlineOrderError(
        item.portionsLeft <= 0
          ? `${item.name} just sold out. Remove it to continue.`
          : `Only ${item.portionsLeft} ${item.name} left. Lower the quantity to continue.`,
      );
    }
  }

  const groupsByItem = await loadOptionGroups(prisma, ids);
  const priced: PricedLine[] = lines.map((l) => {
    const item = byId.get(l.menuItemId)!;
    const sel = checkSelection(groupsByItem.get(item.id) ?? [], l.modifierIds);
    if (!sel.ok) throw new OnlineOrderError(`${item.name}: ${sel.error}. Update your cart to continue.`);
    const unitPrice = round2(Number(item.price) + sel.extra);
    return {
      menuItemId: item.id,
      quantity: l.quantity,
      unitPrice,
      nameSnapshot: item.name,
      lineTotal: round2(unitPrice * l.quantity),
      notes: sel.summary || null,
      modifiers: {
        create: sel.chosen.map((o) => ({ modifierId: o.id, nameSnapshot: o.name, priceAtTime: o.price })),
      },
    };
  });

  const subtotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0));
  // Same rule as the register: tax on the food subtotal.
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);
  return { priced, subtotal, taxAmount, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// System staff row — Order.staffId is required, so online orders belong to
// an inactive "Online orders" staff member that can never log in.
// ─────────────────────────────────────────────────────────────────────────────

const ONLINE_STAFF_EMAIL = "online-orders@system.mondys";

async function getOnlineStaffId(): Promise<string> {
  const existing = await prisma.staff.findUnique({
    where: { email: ONLINE_STAFF_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.staff.upsert({
    where: { email: ONLINE_STAFF_EMAIL },
    update: {},
    create: {
      email: ONLINE_STAFF_EMAIL,
      name: "Online order",
      role: "CASHIER",
      isActive: false,
      pinHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
    },
    select: { id: true },
  });
  return created.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Place an order
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceOrderInput = {
  lines: CartLineInput[];
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  notes: string | null;
  payment: "card" | "pickup";
};

export type PlaceOrderResult =
  | { kind: "card"; orderId: string; clientSecret: string; total: number }
  | { kind: "pickup"; orderId: string };

export async function placeOnlineOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { settings, state } = await getOnlineStatus();
  if (!state.open) throw new OnlineOrderError(state.message);

  const { priced, subtotal, taxAmount, total } = await priceCart(input.lines, settings.taxRate, settings.timezone);

  if (input.payment === "pickup" && total > PAY_AT_PICKUP_LIMIT) {
    throw new OnlineOrderError(
      `Orders over $${PAY_AT_PICKUP_LIMIT} need to be paid online.`,
    );
  }

  const staffId = await getOnlineStaffId();
  const isCard = input.payment === "card";
  const readyAt = new Date(Date.now() + settings.onlinePrepTimeMinutes * 60_000);

  const order = await withUniqueConfirmationCode((code) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          staffId,
          orderType: "TAKEOUT",
          source: "ONLINE_PICKUP",
          // Card orders stay OPEN (invisible to the kitchen) until Stripe
          // confirms the payment. Pay-at-pickup orders go straight in.
          status: isCard ? "OPEN" : "SENT",
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          notes: input.notes,
          onlineConfirmationCode: code,
          estimatedReadyAt: isCard ? null : readyAt,
          subtotal,
          taxAmount,
          total,
          items: { create: priced },
          payments: {
            create: {
              method: isCard ? "STRIPE_ONLINE" : "CASH",
              status: "PENDING",
              amount: total,
            },
          },
        },
        select: { id: true, onlineConfirmationCode: true },
      });

      if (!isCard) {
        await sellPortions(tx, priced, staffId, created.id);
      }
      return created;
    }),
  ).catch((e) => {
    if (e instanceof PortionError) throw new OnlineOrderError(`${e.message}. Update your cart to continue.`);
    throw e;
  });

  if (!isCard) return { kind: "pickup", orderId: order.id };

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create(
      {
        amount: toCents(total),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        description: `Rosewood Cafe online order ${order.onlineConfirmationCode}`,
        receipt_email: input.customerEmail ?? undefined,
        metadata: { orderId: order.id, confirmationCode: order.onlineConfirmationCode ?? "" },
      },
      { idempotencyKey: `order-${order.id}` },
    );
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { stripePaymentIntentId: pi.id } }),
      prisma.payment.updateMany({
        where: { orderId: order.id, method: "STRIPE_ONLINE" },
        data: { processorRef: pi.id },
      }),
    ]);
    if (!pi.client_secret) throw new Error("Stripe returned no client secret");
    return { kind: "card", orderId: order.id, clientSecret: pi.client_secret, total };
  } catch (e) {
    console.error("Stripe PaymentIntent failed:", e);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedReason: "Card payment could not be started" },
    });
    throw new OnlineOrderError("Card payments aren't working right now. Choose pay at pickup or call us.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Card payment confirmed → send to kitchen. Safe to call many times
// (webhook + status page both call it); only the first call does anything.
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizeCardPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  if (pi.status !== "succeeded") return;

  const order = await prisma.order.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true, status: true, total: true, staffId: true },
  });
  if (!order || order.status !== "OPEN") return;

  if (pi.currency !== "usd" || pi.amount_received !== toCents(Number(order.total))) {
    console.error(`Amount mismatch on ${pi.id} for order ${order.id}`);
    return;
  }

  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const card = charge?.payment_method_details?.card ?? null;
  const settings = await getSettings();
  const readyAt = new Date(Date.now() + settings.onlinePrepTimeMinutes * 60_000);

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: "OPEN" },
        data: { status: "SENT", estimatedReadyAt: readyAt },
      });
      if (claimed.count === 0) return; // someone else finalized it

      await tx.payment.updateMany({
        where: { orderId: order.id, method: "STRIPE_ONLINE", status: "PENDING" },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          cardBrand: card?.brand ?? null,
          cardLast4: card?.last4 ?? null,
        },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { menuItemId: true, quantity: true },
      });
      await sellPortions(tx, items, order.staffId, order.id);
    });
  } catch (e) {
    if (!(e instanceof PortionError)) throw e;
    // A dish sold out between checkout and payment: refund and cancel.
    await stripe.refunds.create(
      { payment_intent: pi.id },
      { idempotencyKey: `soldout-refund-${pi.id}` },
    );
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: order.id, status: "OPEN" },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedReason: `${e.message} after payment. Refunded automatically.`,
        },
      }),
      prisma.payment.updateMany({
        where: { orderId: order.id, method: "STRIPE_ONLINE" },
        data: { status: "REFUNDED", refundedAt: new Date(), refundReason: "Sold out" },
      }),
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-facing status (looked up by the long order id, never by code)
// ─────────────────────────────────────────────────────────────────────────────

export type PublicOrder = {
  id: string;
  code: string;
  status: "OPEN" | "SENT" | "READY" | "COMPLETED" | "VOIDED";
  customerName: string | null;
  estimatedReadyAt: Date | null;
  voidedReason: string | null;
  payment: { method: string; status: string } | null;
  items: { name: string; quantity: number; notes: string | null; lineTotal: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  stripePaymentIntentId: string | null;
};

export async function getPublicOrder(orderId: string): Promise<PublicOrder | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, source: "ONLINE_PICKUP" },
    include: {
      items: { select: { nameSnapshot: true, quantity: true, notes: true, lineTotal: true } },
      payments: { select: { method: true, status: true }, take: 1 },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    code: o.onlineConfirmationCode ?? "",
    status: o.status,
    customerName: o.customerName,
    estimatedReadyAt: o.estimatedReadyAt,
    voidedReason: o.voidedReason,
    payment: o.payments[0] ?? null,
    items: o.items.map((i) => ({
      name: i.nameSnapshot,
      quantity: i.quantity,
      notes: i.notes,
      lineTotal: Number(i.lineTotal),
    })),
    subtotal: Number(o.subtotal),
    taxAmount: Number(o.taxAmount),
    total: Number(o.total),
    stripePaymentIntentId: o.stripePaymentIntentId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kitchen / counter queue
// ─────────────────────────────────────────────────────────────────────────────

export type QueueOrder = {
  id: string;
  code: string;
  status: "SENT" | "READY" | "COMPLETED";
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: Date;
  estimatedReadyAt: Date | null;
  completedAt: Date | null;
  total: number;
  paid: boolean;
  items: { name: string; quantity: number; notes: string | null }[];
};

export async function getOnlineQueue(): Promise<QueueOrder[]> {
  const since = new Date(Date.now() - 12 * 60 * 60_000);
  const orders = await prisma.order.findMany({
    where: {
      source: "ONLINE_PICKUP",
      OR: [
        { status: { in: ["SENT", "READY"] } },
        { status: "COMPLETED", completedAt: { gte: since } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      items: { select: { nameSnapshot: true, quantity: true, notes: true } },
      payments: { select: { status: true }, take: 1 },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    code: o.onlineConfirmationCode ?? "",
    status: o.status as QueueOrder["status"],
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    notes: o.notes,
    createdAt: o.createdAt,
    estimatedReadyAt: o.estimatedReadyAt,
    completedAt: o.completedAt,
    total: Number(o.total),
    paid: o.payments[0]?.status === "COMPLETED",
    items: o.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity, notes: i.notes })),
  }));
}

export async function markOnlineReady(orderId: string): Promise<void> {
  const res = await prisma.order.updateMany({
    where: { id: orderId, source: "ONLINE_PICKUP", status: "SENT" },
    data: { status: "READY" },
  });
  if (res.count === 0) throw new OnlineOrderError("This order isn't waiting to be made");
}

/**
 * Customer picked up. For pay-at-pickup orders, record how they paid; cash
 * goes on the staff member's open shift so the drawer count matches.
 */
export async function markOnlinePickedUp(
  orderId: string,
  staffId: string,
  paidWith: "CASH" | "CARD_PRESENT" | null,
): Promise<void> {
  await prisma.$transaction(async (tx: Tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, source: "ONLINE_PICKUP", status: { in: ["SENT", "READY"] } },
      include: { payments: { take: 1 } },
    });
    if (!order) throw new OnlineOrderError("This order was already picked up or cancelled");
    const payment = order.payments[0];
    const needsPayment = payment?.status === "PENDING";

    let shiftId: string | null = order.shiftId;
    if (needsPayment) {
      if (!paidWith) throw new OnlineOrderError("Choose how the customer paid");
      const shift = await tx.shift.findFirst({
        where: { staffId, endedAt: null },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (!shift && paidWith === "CASH") {
        throw new OnlineOrderError("Open your shift before taking cash");
      }
      shiftId = shift?.id ?? null;
      await tx.payment.update({
        where: { id: payment.id },
        data: { method: paidWith, status: "COMPLETED", processedAt: new Date() },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED", completedAt: new Date(), shiftId },
    });
  });
}
