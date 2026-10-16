import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import { accountsFrom, dailyTotals, defaultRange, isValidRange, sumTotals } from "@/lib/accounting";
import { addDays, businessDate } from "@/lib/business-date";
import { AccountingView } from "@/components/reports/AccountingView";

export const metadata: Metadata = { title: "Tax & accounting · Rosewood Cafe", robots: { index: false } };

type Search = Promise<{ from?: string; to?: string }>;

export default async function AccountingPage({ searchParams }: { searchParams: Search }) {
  await connection();
  const manager = await getManagerFromSession();
  if (!manager) redirect("/login");
  const settings = await getSettings();
  const sp = await searchParams;
  const range = sp.from && sp.to && isValidRange(sp.from, sp.to) ? { from: sp.from, to: sp.to } : defaultRange(settings.timezone);
  // Keep the on-screen preview quick: at most ~3 months at a time.
  const days = await dailyTotals(range.from, range.to, settings.timezone);
  const row = await prisma.restaurantSettings.findFirst({ select: { accountingAccounts: true } });
  const today = businessDate(settings.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Today so far", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -7), to: addDays(today, -1) },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
  ];

  return (
    <AccountingView
      range={range}
      presets={presets}
      timezone={settings.timezone}
      taxRate={settings.taxRate}
      days={days.length > 100 ? [] : days}
      totals={sumTotals(days)}
      accounts={accountsFrom(row?.accountingAccounts)}
    />
  );
}
