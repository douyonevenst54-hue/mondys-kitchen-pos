import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { businessDate } from "@/lib/business-date";
import { emailStatus } from "@/lib/notify";
import { audienceCount } from "@/lib/campaigns";
import { PromotionsBoard, type PromoRow } from "@/components/admin/PromotionsBoard";

export const metadata: Metadata = { title: "Promotions", robots: { index: false } };

export default async function PromotionsPage() {
  await connection();
  const manager = await getManagerFromSession();
  if (!manager) redirect("/login");
  const settings = await getSettings();
  const tz = settings.timezone;

  const [discounts, uses, campaigns, audience] = await Promise.all([
    prisma.discount.findMany({ where: { type: { not: "COMP" } }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    prisma.orderDiscount.groupBy({
      by: ["discountId"],
      where: { order: { status: { notIn: ["OPEN", "VOIDED"] } } },
      _count: { _all: true },
      _sum: { amountApplied: true },
    }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { discount: { select: { code: true } } } }),
    audienceCount(),
  ]);
  const useMap = new Map(uses.map((u) => [u.discountId, u]));
  const now = new Date();

  const rows: PromoRow[] = discounts.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    type: d.type as "PERCENT" | "FIXED_AMOUNT",
    value: Number(d.value),
    minSubtotal: d.minSubtotal ? Number(d.minSubtotal) : null,
    startsOn: d.startsAt ? businessDate(tz, d.startsAt) : "",
    endsOn: d.endsAt ? businessDate(tz, d.endsAt) : "",
    maxUses: d.maxUses,
    oncePerCustomer: d.oncePerCustomer,
    online: d.online,
    bannerText: d.bannerText ?? "",
    isActive: d.isActive,
    state: !d.isActive ? "off" : d.endsAt && d.endsAt < now ? "expired" : d.startsAt && d.startsAt > now ? "scheduled" : "live",
    uses: useMap.get(d.id)?._count._all ?? 0,
    given: Number(useMap.get(d.id)?._sum.amountApplied ?? 0),
  }));

  return (
    <PromotionsBoard
      promos={rows}
      audience={audience}
      email={emailStatus()}
      campaigns={campaigns.map((c) => ({
        id: c.id,
        subject: c.subject,
        code: c.discount?.code ?? null,
        when: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(c.createdAt),
        recipients: c.recipients,
        sent: c.sentCount,
        failed: c.failedCount,
        finished: Boolean(c.finishedAt),
      }))}
    />
  );
}
