import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { prisma } from "@/lib/prisma";
import { accountsFrom, dailySummaryCsv, isValidRange, ordersCsv, quickbooksJournalCsv } from "@/lib/accounting";

/** CSV downloads for the accountant. Managers and owners only. */
export async function GET(req: Request) {
  const manager = await getManagerFromSession();
  if (!manager) return new Response("Sign in as a manager", { status: 401 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isValidRange(from, to)) return new Response("Pick a valid date range", { status: 400 });
  const settings = await getSettings();
  const row = await prisma.restaurantSettings.findFirst({ select: { accountingAccounts: true } });

  let body: string;
  let name: string;
  if (kind === "qbo") {
    body = await quickbooksJournalCsv(from, to, settings.timezone, accountsFrom(row?.accountingAccounts), settings.name);
    name = `quickbooks-journal_${from}_to_${to}.csv`;
  } else if (kind === "summary") {
    body = await dailySummaryCsv(from, to, settings.timezone);
    name = `daily-sales_${from}_to_${to}.csv`;
  } else if (kind === "orders") {
    body = await ordersCsv(from, to, settings.timezone);
    name = `payments-by-order_${from}_to_${to}.csv`;
  } else {
    return new Response("Unknown export", { status: 400 });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
