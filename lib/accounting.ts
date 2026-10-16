import "server-only";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, businessDate } from "@/lib/business-date";
import { restaurantTimeToDate } from "@/lib/online-hours";

/**
 * Accounting exports. Sales are counted on the day the money came in
 * (payment time, restaurant timezone), and refunds on the day they were
 * refunded, so each day matches the cash drawer and the card deposits.
 *
 * Every payment is split into the parts of its order (food, discount,
 * delivery fee, meals tax, tip) in proportion to its share of the order, so
 * split payments add up exactly. Pay-at-pickup orders count once they're paid.
 */

export const DEFAULT_ACCOUNTS = {
  sales: "Food & Beverage Sales",
  discounts: "Discounts & Comps",
  delivery: "Delivery Fee Income",
  tax: "Meals Tax Payable",
  tips: "Tips Payable",
  cash: "Undeposited Funds",
  card: "Clover Clearing",
  stripe: "Stripe Clearing",
  other: "Other Payments Clearing",
} as const;
export type AccountKey = keyof typeof DEFAULT_ACCOUNTS;
export type AccountMap = Record<AccountKey, string>;

export function accountsFrom(raw: unknown): AccountMap {
  const out: AccountMap = { ...DEFAULT_ACCOUNTS };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(DEFAULT_ACCOUNTS) as AccountKey[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100);
    }
  }
  return out;
}

type Bucket = "cash" | "card" | "stripe" | "other";
function bucketOf(method: PaymentMethod): Bucket {
  switch (method) {
    case "CASH":
      return "cash";
    case "CARD_PRESENT":
    case "CARD_MANUAL":
    case "MOBILE_WALLET":
    case "CLOVER_ONLINE":
      return "card";
    case "STRIPE_ONLINE":
      return "stripe";
    default:
      return "other";
  }
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD_PRESENT: "Card",
  CARD_MANUAL: "Card (keyed)",
  MOBILE_WALLET: "Mobile wallet",
  CLOVER_ONLINE: "Online card (Clover)",
  STRIPE_ONLINE: "Online card (Stripe)",
  GIFT_CARD: "Gift card",
  STORE_CREDIT: "Store credit",
  CASH_APP: "Cash App / Zelle",
  CHECK: "Check",
  HOUSE_ACCOUNT: "House account",
  PI_NETWORK: "Pi",
  OTHER: "Other",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One payment (or refund of it), split into the parts of its order. */
type Entry = {
  day: string; // YYYY-MM-DD restaurant time
  sign: 1 | -1; // 1 = money in, -1 = refund
  bucket: Bucket;
  method: string;
  amount: number;
  sales: number;
  discount: number;
  delivery: number;
  tax: number;
  tip: number;
  taxable: number;
  order: {
    id: string;
    number: number;
    code: string | null;
    source: string;
    type: string;
    customer: string | null;
    status: string;
    createdAt: Date;
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    delivery: number;
    total: number;
    taxExempt: boolean;
  };
  at: Date;
};

export type DayTotals = {
  day: string;
  orders: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  taxableSales: number;
  tax: number;
  delivery: number;
  tips: number;
  collected: number;
  cash: number;
  card: number;
  stripe: number;
  other: number;
  refunds: number;
};

export function isValidRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || from < "2020-01-01") return false;
  // At most about a year per file.
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 370;
}

async function loadEntries(from: string, to: string, timezone: string): Promise<Entry[]> {
  const start = restaurantTimeToDate(`${from}T00:00`, timezone)!;
  const end = restaurantTimeToDate(`${addDays(to, 1)}T00:00`, timezone)!;
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { status: { in: ["COMPLETED", "REFUNDED"] }, processedAt: { gte: start, lt: end } },
        { status: "REFUNDED", refundedAt: { gte: start, lt: end } },
      ],
    },
    orderBy: { processedAt: "asc" },
    select: {
      method: true,
      status: true,
      amount: true,
      processedAt: true,
      refundedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          onlineConfirmationCode: true,
          source: true,
          orderType: true,
          customerName: true,
          status: true,
          createdAt: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          tipAmount: true,
          deliveryFee: true,
          total: true,
          taxExempt: true,
        },
      },
    },
  });

  const entries: Entry[] = [];
  for (const p of payments) {
    const o = p.order;
    const total = Number(o.total);
    const amount = Number(p.amount);
    const share = total > 0 ? amount / total : 0;
    const discount = r2(Number(o.discountAmount) * share);
    const delivery = r2(Number(o.deliveryFee) * share);
    const tax = r2(Number(o.taxAmount) * share);
    const tip = r2(Number(o.tipAmount) * share);
    // Food sales take the rounding remainder so every entry balances to the cent.
    const sales = r2(amount - tax - tip - delivery + discount);
    const order = {
      id: o.id,
      number: o.orderNumber,
      code: o.onlineConfirmationCode,
      source: o.source === "ONLINE_PICKUP" ? "Online" : "Register",
      type: o.orderType,
      customer: o.customerName,
      status: o.status,
      createdAt: o.createdAt,
      subtotal: Number(o.subtotal),
      discount: Number(o.discountAmount),
      tax: Number(o.taxAmount),
      tip: Number(o.tipAmount),
      delivery: Number(o.deliveryFee),
      total,
      taxExempt: o.taxExempt,
    };
    const base = {
      bucket: bucketOf(p.method),
      method: METHOD_LABEL[p.method] ?? p.method,
      amount,
      sales,
      discount,
      delivery,
      tax,
      tip,
      taxable: o.taxExempt ? 0 : r2(sales - discount),
      order,
    };
    if (p.processedAt >= start && p.processedAt < end) {
      entries.push({ ...base, day: businessDate(timezone, p.processedAt), sign: 1, at: p.processedAt });
    }
    if (p.status === "REFUNDED" && p.refundedAt && p.refundedAt >= start && p.refundedAt < end) {
      entries.push({ ...base, day: businessDate(timezone, p.refundedAt), sign: -1, at: p.refundedAt });
    }
  }
  return entries;
}

export async function dailyTotals(from: string, to: string, timezone: string): Promise<DayTotals[]> {
  const entries = await loadEntries(from, to, timezone);
  const days = new Map<string, DayTotals & { ids: Set<string> }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.set(d, {
      day: d, orders: 0, grossSales: 0, discounts: 0, netSales: 0, taxableSales: 0, tax: 0, delivery: 0,
      tips: 0, collected: 0, cash: 0, card: 0, stripe: 0, other: 0, refunds: 0, ids: new Set(),
    });
  }
  for (const e of entries) {
    const t = days.get(e.day);
    if (!t) continue;
    const s = e.sign;
    if (s === 1) t.ids.add(e.order.id);
    t.grossSales += s * e.sales;
    t.discounts += s * e.discount;
    t.netSales += s * (e.sales - e.discount);
    t.taxableSales += s * e.taxable;
    t.tax += s * e.tax;
    t.delivery += s * e.delivery;
    t.tips += s * e.tip;
    t.collected += s * e.amount;
    t[e.bucket] += s * e.amount;
    if (s === -1) t.refunds += e.amount;
  }
  return [...days.values()].map(({ ids, ...t }) => {
    const out = { ...t, orders: ids.size } as DayTotals;
    for (const k of Object.keys(out) as (keyof DayTotals)[]) {
      if (typeof out[k] === "number" && k !== "orders") (out[k] as number) = r2(out[k] as number);
    }
    return out;
  });
}

export function sumTotals(days: DayTotals[]): DayTotals {
  const z: DayTotals = {
    day: "Total", orders: 0, grossSales: 0, discounts: 0, netSales: 0, taxableSales: 0, tax: 0, delivery: 0,
    tips: 0, collected: 0, cash: 0, card: 0, stripe: 0, other: 0, refunds: 0,
  };
  for (const d of days) {
    for (const k of Object.keys(z) as (keyof DayTotals)[]) {
      if (k !== "day") (z[k] as number) = r2((z[k] as number) + (d[k] as number));
    }
  }
  return z;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV files
// ─────────────────────────────────────────────────────────────────────────────

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const s = typeof v === "number" ? v.toFixed(2) : v;
    // Neutralise spreadsheet formulas typed into names or notes.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const usDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
};

/**
 * QuickBooks Online journal entries: one balanced entry per day.
 * Import: QuickBooks > Settings (gear) > Import data > Journal entries.
 */
export async function quickbooksJournalCsv(from: string, to: string, timezone: string, accounts: AccountMap): Promise<string> {
  const days = await dailyTotals(from, to, timezone);
  const rows: (string | number | null)[][] = [["Journal No.", "Journal Date", "Account Name", "Description", "Debits", "Credits"]];
  for (const d of days) {
    if (d.collected === 0 && d.refunds === 0 && d.grossSales === 0) continue;
    const no = `RW-${d.day.replace(/-/g, "")}`;
    const date = usDate(d.day);
    const desc = `Rosewood Cafe daily sales ${date} (${d.orders} order${d.orders === 1 ? "" : "s"}${d.refunds ? `, ${d.refunds.toFixed(2)} refunded` : ""})`;
    // Positive = debit, negative = credit.
    const lines: [AccountKey, number][] = [
      ["cash", d.cash],
      ["card", d.card],
      ["stripe", d.stripe],
      ["other", d.other],
      ["discounts", d.discounts],
      ["sales", -d.grossSales],
      ["delivery", -d.delivery],
      ["tax", -d.tax],
      ["tips", -d.tips],
    ];
    // Same account name used twice (e.g. both card types to one clearing account): combine.
    const byName = new Map<string, number>();
    for (const [k, v] of lines) byName.set(accounts[k], r2((byName.get(accounts[k]) ?? 0) + v));
    for (const [name, v] of byName) {
      if (Math.abs(v) < 0.005) continue;
      rows.push([no, date, name, desc, v > 0 ? v : null, v < 0 ? -v : null]);
    }
  }
  return csv(rows);
}

export async function dailySummaryCsv(from: string, to: string, timezone: string): Promise<string> {
  const days = await dailyTotals(from, to, timezone);
  const head = [
    "Date", "Orders paid", "Gross sales", "Discounts", "Net sales", "Taxable sales", "Meals tax", "Delivery fees",
    "Tips", "Total collected", "Cash", "Card (Clover)", "Online card (Stripe)", "Other", "Refunds",
  ];
  const line = (d: DayTotals) => [
    d.day === "Total" ? "Total" : usDate(d.day), String(d.orders), d.grossSales, d.discounts, d.netSales, d.taxableSales,
    d.tax, d.delivery, d.tips, d.collected, d.cash, d.card, d.stripe, d.other, d.refunds,
  ];
  return csv([head, ...days.map(line), line(sumTotals(days))]);
}

export async function ordersCsv(from: string, to: string, timezone: string): Promise<string> {
  const entries = await loadEntries(from, to, timezone);
  const time = (at: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(at);
  const rows: (string | number | null)[][] = [[
    "Date", "Time", "Order #", "Online code", "Source", "Type", "Customer", "Paid with", "Kind",
    "Food", "Discount", "Meals tax", "Tip", "Delivery fee", "Amount", "Order status",
  ]];
  for (const e of entries) {
    const s = e.sign;
    rows.push([
      usDate(e.day), time(e.at), String(e.order.number), e.order.code, e.order.source,
      e.order.type.replace("_", "-").toLowerCase(), e.order.customer, e.method, s === 1 ? "Payment" : "Refund",
      s * e.sales, s * e.discount, s * e.tax, s * e.tip, s * e.delivery, s * e.amount, e.order.status.toLowerCase(),
    ]);
  }
  return csv(rows);
}

export function defaultRange(timezone: string): { from: string; to: string } {
  const today = businessDate(timezone);
  return { from: addDays(today, -1), to: addDays(today, -1) };
}
