import "server-only";
import { prisma } from "@/lib/prisma";

export type OrderListRow = {
  id: string;
  orderNumber: number;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  status: "OPEN" | "SENT" | "READY" | "COMPLETED" | "VOIDED";
  createdAt: Date;
  completedAt: Date | null;
  total: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  deliveryFee: number;
  itemCount: number;
  customerName: string | null;
  tableNumber: number | null;
  staffName: string;
  primaryPaymentMethod: string | null;
};

export type OrderStats = {
  orderCount: number;
  revenue: number;        // total - tips (tips pass through to staff)
  tipsTotal: number;      // sum of tipAmount on completed orders
  deliveryFeesTotal: number; // sum of deliveryFee on completed orders (included in revenue above)
  averageTicket: number;
  voidedCount: number;
  byPaymentMethod: { method: string; count: number; total: number }[];
};

export type OrderRange = {
  from: Date;
  to: Date;
};

export type DailyReport = {
  date: Date;
  // Totals
  orderCount: number;
  voidedCount: number;
  revenue: number;          // total - tips (what the business takes in)
  tipsTotal: number;        // owed to staff
  deliveryFeesTotal: number; // included in revenue
  taxTotal: number;
  discountTotal: number;
  // By order type
  byOrderType: {
    type: "DINE_IN" | "TAKEOUT" | "DELIVERY";
    count: number;
    revenue: number;        // total - tips for this type
  }[];
  // By payment method (cash drawer reconciliation)
  byPaymentMethod: {
    method: string;
    count: number;
    total: number;
  }[];
  // Top sellers by quantity
  topSellers: {
    name: string;
    quantitySold: number;
    revenue: number;
  }[];
  // Shifts that closed during this day (for cash drawer reconciliation)
  closedShifts: {
    id: string;
    staffName: string;
    startedAt: Date;
    endedAt: Date;
    openingCash: number;
    closingCash: number;
    expectedCash: number;
    variance: number;
  }[];
};

export function resolveOrderRange(
  preset: "today" | "yesterday" | "last7",
): OrderRange {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }
  if (preset === "yesterday") {
    const from = new Date(start);
    from.setDate(from.getDate() - 1);
    return { from, to: start };
  }
  const from = new Date(start);
  from.setDate(from.getDate() - 6);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from, to: end };
}

export async function listOrders(range: OrderRange): Promise<OrderListRow[]> {
  const rows = await prisma.order.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
    },
    orderBy: { createdAt: "desc" },
    include: {
      staff: { select: { name: true } },
      table: { select: { number: true } },
      items: { select: { quantity: true } },
      payments: {
        select: { method: true, amount: true },
        orderBy: { processedAt: "desc" },
        take: 1,
      },
    },
  });

  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    status: o.status,
    createdAt: o.createdAt,
    completedAt: o.completedAt,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discountAmount),
    taxAmount: Number(o.taxAmount),
    tipAmount: Number(o.tipAmount),
    deliveryFee: Number(o.deliveryFee),
    itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
    customerName: o.customerName,
    tableNumber: o.table?.number ?? null,
    staffName: o.staff.name,
    primaryPaymentMethod: o.payments[0]?.method ?? null,
  }));
}

export async function getOrderStats(range: OrderRange): Promise<OrderStats> {
  const completed = await prisma.order.aggregate({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: "COMPLETED",
    },
    _count: { _all: true },
    _sum: { total: true, tipAmount: true, deliveryFee: true },
  });

  const voidedCount = await prisma.order.count({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: "VOIDED",
    },
  });

  const paymentGroups = await prisma.payment.groupBy({
    by: ["method"],
    where: {
      status: "COMPLETED",
      order: {
        createdAt: { gte: range.from, lt: range.to },
        status: "COMPLETED",
      },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const orderCount = completed._count._all;
  const totalSum = Number(completed._sum.total ?? 0);
  const tipsTotal = Number(completed._sum.tipAmount ?? 0);
  const deliveryFeesTotal = Number(completed._sum.deliveryFee ?? 0);
  // Revenue = what the business takes in (delivery fee included)
  // MINUS tips (which pass through to staff at end of shift)
  const revenue = totalSum - tipsTotal;
  const averageTicket = orderCount > 0 ? revenue / orderCount : 0;

  return {
    orderCount,
    revenue: Math.round(revenue * 100) / 100,
    tipsTotal: Math.round(tipsTotal * 100) / 100,
    deliveryFeesTotal: Math.round(deliveryFeesTotal * 100) / 100,
    averageTicket: Math.round(averageTicket * 100) / 100,
    voidedCount,
    byPaymentMethod: paymentGroups
      .map((g) => ({
        method: g.method,
        count: g._count._all,
        total: Math.round(Number(g._sum.amount ?? 0) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

export type OrderDetail = {
  id: string;
  orderNumber: number;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  status: "OPEN" | "SENT" | "READY" | "COMPLETED" | "VOIDED";
  createdAt: Date;
  completedAt: Date | null;
  voidedAt: Date | null;
  voidedReason: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  tableNumber: number | null;
  staffName: string;
  notes: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  deliveryFee: number;
  total: number;
  taxExempt: boolean;
  taxExemptReason: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
  }[];
  payments: {
    id: string;
    method: string;
    amount: number;
    tendered: number | null;
    changeGiven: number | null;
    cardLast4: string | null;
    cardBrand: string | null;
    processedAt: Date;
    status: string;
  }[];
  discounts: {
    id: string;
    discountName: string;
    amountApplied: number;
    reason: string | null;
    appliedByStaffName: string;
  }[];
};

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      staff: { select: { name: true } },
      table: { select: { number: true } },
      items: true,
      payments: { orderBy: { processedAt: "asc" } },
      discounts: {
        include: {
          discount: { select: { name: true } },
        },
      },
    },
  });
  if (!o) return null;

  const appliedByIds = o.discounts.map((d) => d.appliedByStaffId);
  const appliers =
    appliedByIds.length > 0
      ? await prisma.staff.findMany({
          where: { id: { in: appliedByIds } },
          select: { id: true, name: true },
        })
      : [];
  const applierById = new Map(appliers.map((s) => [s.id, s.name]));

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    status: o.status,
    createdAt: o.createdAt,
    completedAt: o.completedAt,
    voidedAt: o.voidedAt,
    voidedReason: o.voidedReason,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    deliveryNotes: o.deliveryNotes,
    tableNumber: o.table?.number ?? null,
    staffName: o.staff.name,
    notes: o.notes,
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discountAmount),
    taxAmount: Number(o.taxAmount),
    tipAmount: Number(o.tipAmount),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    taxExempt: o.taxExempt,
    taxExemptReason: o.taxExemptReason,
    items: o.items.map((i) => ({
      id: i.id,
      name: i.nameSnapshot,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      notes: i.notes,
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      tendered: p.tendered ? Number(p.tendered) : null,
      changeGiven: p.changeGiven ? Number(p.changeGiven) : null,
      cardLast4: p.cardLast4,
      cardBrand: p.cardBrand,
      processedAt: p.processedAt,
      status: p.status,
    })),
    discounts: o.discounts.map((d) => ({
      id: d.id,
      discountName: d.discount.name,
      amountApplied: Number(d.amountApplied),
      reason: d.reason,
      appliedByStaffName: applierById.get(d.appliedByStaffId) ?? "Unknown",
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily report (Z-report) — everything needed to reconcile a day's business
// ─────────────────────────────────────────────────────────────────────────────

export function resolveDayRange(date: Date): OrderRange {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export async function getDailyReport(date: Date): Promise<DailyReport> {
  const range = resolveDayRange(date);

  // 1. Top-line totals over completed orders
  const totals = await prisma.order.aggregate({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: "COMPLETED",
    },
    _count: { _all: true },
    _sum: {
      total: true,
      tipAmount: true,
      deliveryFee: true,
      taxAmount: true,
      discountAmount: true,
    },
  });

  const voidedCount = await prisma.order.count({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: "VOIDED",
    },
  });

  // 2. Group by order type
  const byTypeRaw = await prisma.order.groupBy({
    by: ["orderType"],
    where: {
      createdAt: { gte: range.from, lt: range.to },
      status: "COMPLETED",
    },
    _count: { _all: true },
    _sum: { total: true, tipAmount: true },
  });

  // 3. Group by payment method
  const paymentGroups = await prisma.payment.groupBy({
    by: ["method"],
    where: {
      status: "COMPLETED",
      order: {
        createdAt: { gte: range.from, lt: range.to },
        status: "COMPLETED",
      },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });

  // 4. Top sellers — group OrderItem rows by menuItem, sum quantity and lineTotal
  const itemGroups = await prisma.orderItem.groupBy({
    by: ["nameSnapshot"],
    where: {
      order: {
        createdAt: { gte: range.from, lt: range.to },
        status: "COMPLETED",
      },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 10,
  });

  // 5. Shifts that ended during this day (for cash drawer reconciliation)
  const closedShifts = await prisma.shift.findMany({
    where: {
      endedAt: { gte: range.from, lt: range.to },
    },
    orderBy: { endedAt: "asc" },
    include: { staff: { select: { name: true } } },
  });

  const revenueRaw = Number(totals._sum.total ?? 0);
  const tipsTotal = Number(totals._sum.tipAmount ?? 0);
  const deliveryFeesTotal = Number(totals._sum.deliveryFee ?? 0);
  const taxTotal = Number(totals._sum.taxAmount ?? 0);
  const discountTotal = Number(totals._sum.discountAmount ?? 0);
  const revenue = revenueRaw - tipsTotal;

  return {
    date: range.from,
    orderCount: totals._count._all,
    voidedCount,
    revenue: Math.round(revenue * 100) / 100,
    tipsTotal: Math.round(tipsTotal * 100) / 100,
    deliveryFeesTotal: Math.round(deliveryFeesTotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    byOrderType: byTypeRaw
      .map((g) => ({
        type: g.orderType,
        count: g._count._all,
        revenue:
          Math.round(
            (Number(g._sum.total ?? 0) - Number(g._sum.tipAmount ?? 0)) * 100,
          ) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    byPaymentMethod: paymentGroups
      .map((g) => ({
        method: g.method,
        count: g._count._all,
        total: Math.round(Number(g._sum.amount ?? 0) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total),
    topSellers: itemGroups.map((g) => ({
      name: g.nameSnapshot,
      quantitySold: Number(g._sum.quantity ?? 0),
      revenue: Math.round(Number(g._sum.lineTotal ?? 0) * 100) / 100,
    })),
    closedShifts: closedShifts.map((s) => ({
      id: s.id,
      staffName: s.staff.name,
      startedAt: s.startedAt,
      endedAt: s.endedAt!,
      openingCash: Number(s.openingCash),
      closingCash: Number(s.closingCash ?? 0),
      expectedCash: Number(s.expectedCash ?? 0),
      variance: Number(s.variance ?? 0),
    })),
  };
}