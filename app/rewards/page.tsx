import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { RewardsBoard } from "@/components/admin/RewardsBoard";

export const metadata: Metadata = { title: "Rewards", robots: { index: false } };

type Search = Promise<{ q?: string }>;

export default async function RewardsPage({ searchParams }: { searchParams: Search }) {
  await connection();
  const manager = await getManagerFromSession();
  if (!manager) redirect("/login");
  const s = await getSettings();
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const digits = q.replace(/\D/g, "");

  const where = q
    ? {
        OR: [
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [customers, totals] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: q ? { points: "desc" } : { lastOrderAt: { sort: "desc", nulls: "last" } },
      take: 25,
      include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
    }),
    prisma.customer.aggregate({ _count: { _all: true }, _sum: { points: true } }),
  ]);
  const optedIn = await prisma.customer.count({ where: { marketingOptIn: true, email: { not: null } } });
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: s.timezone }).format(d);

  return (
    <RewardsBoard
      settings={{
        enabled: s.loyaltyEnabled,
        pointsPerDollar: s.loyaltyPointsPerDollar,
        rewardPoints: s.loyaltyRewardPoints,
        rewardValue: s.loyaltyRewardValue,
      }}
      q={q}
      stats={{ customers: totals._count._all, points: totals._sum.points ?? 0, optedIn }}
      customers={customers.map((c) => ({
        id: c.id,
        phone: c.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3"),
        name: c.name,
        email: c.email,
        points: c.points,
        optedIn: c.marketingOptIn,
        lastOrder: c.lastOrderAt ? fmt(c.lastOrderAt) : null,
        events: c.events.map((e) => ({ id: e.id, when: fmt(e.createdAt), points: e.points, note: e.note ?? e.kind })),
      }))}
    />
  );
}
