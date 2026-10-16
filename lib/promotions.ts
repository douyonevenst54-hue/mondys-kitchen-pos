import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/loyalty";

/**
 * Promo codes (the Discount table). The register lists every active one;
 * customers can type the ones marked "online" at checkout.
 */

export type PromoCheck =
  | {
      ok: true;
      id: string;
      code: string;
      name: string;
      type: "PERCENT" | "FIXED_AMOUNT";
      value: number;
      minSubtotal: number | null;
      amount: number;
    }
  | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function promoAmount(type: "PERCENT" | "FIXED_AMOUNT", value: number, subtotal: number): number {
  const raw = type === "PERCENT" ? (subtotal * value) / 100 : value;
  return r2(Math.max(0, Math.min(raw, subtotal)));
}

export async function checkPromo(rawCode: string, subtotal: number, phone: string | null): Promise<PromoCheck> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { ok: false, error: "Type a promo code" };
  const d = await prisma.discount.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
    select: {
      id: true, code: true, name: true, type: true, value: true, isActive: true, online: true,
      startsAt: true, endsAt: true, minSubtotal: true, maxUses: true, oncePerCustomer: true,
    },
  });
  const now = new Date();
  if (!d || !d.online || d.type === "COMP") return { ok: false, error: `"${code}" isn't a valid promo code.` };
  if (!d.isActive || (d.endsAt && d.endsAt < now)) return { ok: false, error: `The code ${d.code} has expired.` };
  if (d.startsAt && d.startsAt > now) return { ok: false, error: `The code ${d.code} isn't active yet.` };
  const min = d.minSubtotal ? Number(d.minSubtotal) : null;
  if (min && subtotal < min) {
    return { ok: false, error: `${d.code} works on orders of $${min.toFixed(2)} or more. Add $${(min - subtotal).toFixed(2)} more to use it.` };
  }
  const counted = { order: { status: { notIn: ["OPEN", "VOIDED"] as ("OPEN" | "VOIDED")[] } } };
  if (d.maxUses) {
    const used = await prisma.orderDiscount.count({ where: { discountId: d.id, ...counted } });
    if (used >= d.maxUses) return { ok: false, error: `${d.code} has been fully used. Thanks for your interest!` };
  }
  if (d.oncePerCustomer) {
    const p = normalizePhone(phone);
    if (p) {
      const mine = await prisma.orderDiscount.count({
        where: { discountId: d.id, order: { status: { notIn: ["OPEN", "VOIDED"] }, customer: { phone: p } } },
      });
      if (mine > 0) return { ok: false, error: `You've already used ${d.code}. It's one per customer.` };
    }
  }
  const type = d.type as "PERCENT" | "FIXED_AMOUNT";
  const value = Number(d.value);
  return { ok: true, id: d.id, code: d.code, name: d.name, type, value, minSubtotal: min, amount: promoAmount(type, value, subtotal) };
}

/** Promos with a banner, for the top of the online order page. */
export async function activeBanners(): Promise<{ code: string; text: string }[]> {
  const now = new Date();
  const rows = await prisma.discount.findMany({
    where: {
      isActive: true,
      online: true,
      bannerText: { not: null },
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { code: true, bannerText: true },
  });
  return rows.map((r) => ({ code: r.code, text: r.bannerText ?? "" }));
}
