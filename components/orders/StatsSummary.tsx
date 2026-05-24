import { Receipt, DollarSign, TrendingUp, Ban, HandCoins } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { OrderStats } from "@/lib/orders";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD_PRESENT: "Card",
  CARD_MANUAL: "Card (keyed)",
  MOBILE_WALLET: "Mobile pay",
  GIFT_CARD: "Gift card",
  STORE_CREDIT: "Store credit",
  CASH_APP: "Cash App/Zelle",
  CHECK: "Check",
  PI_NETWORK: "Pi Network",
  HOUSE_ACCOUNT: "House account",
  OTHER: "Other",
};

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

export function StatsSummary({ stats }: { stats: OrderStats }) {
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="Orders"
          value={stats.orderCount.toString()}
          sublabel={
            stats.voidedCount > 0
              ? `${stats.voidedCount} voided`
              : undefined
          }
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Revenue"
          value={formatMoney(stats.revenue)}
          sublabel={
            stats.deliveryFeesTotal > 0
              ? `incl. ${formatMoney(stats.deliveryFeesTotal)} delivery`
              : undefined
          }
          emphasis
        />
        <StatCard
          icon={<HandCoins className="h-4 w-4" />}
          label="Tips"
          value={formatMoney(stats.tipsTotal)}
          sublabel="to staff"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg ticket"
          value={formatMoney(stats.averageTicket)}
        />
        <StatCard
          icon={<Ban className="h-4 w-4" />}
          label="Voided"
          value={stats.voidedCount.toString()}
          tone="muted"
        />
      </div>

      {stats.byPaymentMethod.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
            Payments
          </span>
          {stats.byPaymentMethod.map((m) => (
            <span
              key={m.method}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-sans text-xs ring-1 ring-mondy-border"
            >
              <span className="font-semibold text-mondy-ink">
                {paymentLabel(m.method)}
              </span>
              <span className="text-mondy-muted tabular">
                {formatMoney(m.total)}
              </span>
              <span className="rounded bg-mondy-cream px-1 text-[10px] font-medium text-mondy-muted tabular">
                {m.count}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  emphasis,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: boolean;
  tone?: "muted";
}) {
  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${
        emphasis
          ? "bg-mondy-red/5 ring-mondy-red/20"
          : tone === "muted"
            ? "bg-mondy-cream/60 ring-mondy-border"
            : "bg-white ring-mondy-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-mondy-muted">
        <span aria-hidden>{icon}</span>
        <span className="font-sans text-[10px] uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p
        className={`mt-1.5 font-display text-2xl font-bold tabular sm:text-3xl ${
          emphasis ? "text-mondy-red" : "text-mondy-ink"
        }`}
      >
        {value}
      </p>
      {sublabel && (
        <p className="mt-0.5 font-sans text-[10px] text-mondy-muted">
          {sublabel}
        </p>
      )}
    </div>
  );
}

export { paymentLabel };