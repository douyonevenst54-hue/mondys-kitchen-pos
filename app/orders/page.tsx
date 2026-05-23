import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  listOrders,
  getOrderStats,
  resolveOrderRange,
} from "@/lib/orders";
import { OrdersPageHeader } from "@/components/orders/OrdersPageHeader";
import { StatsSummary } from "@/components/orders/StatsSummary";
import { OrderList } from "@/components/orders/OrderList";
import { RangeSelector } from "@/components/orders/RangeSelector";

type Session = { staffId: string; name: string; role: string };

async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
};

type SearchParams = Promise<{ range?: string }>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const rawRange = params.range ?? "today";
  const range: "today" | "yesterday" | "last7" =
    rawRange === "yesterday" || rawRange === "last7" ? rawRange : "today";

  const resolved = resolveOrderRange(range);

  const [orders, stats] = await Promise.all([
    listOrders(resolved),
    getOrderStats(resolved),
  ]);

  return (
    <main className="min-h-screen bg-mondy-cream">
      <OrdersPageHeader
        title="Orders"
        subtitle={RANGE_LABELS[range]}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeSelector current={range} />
          <p className="font-sans text-xs text-mondy-muted">
            {orders.length} {orders.length === 1 ? "order" : "orders"} ·{" "}
            {RANGE_LABELS[range].toLowerCase()}
          </p>
        </div>

        <StatsSummary stats={stats} />

        <OrderList orders={orders} />
      </div>
    </main>
  );
}