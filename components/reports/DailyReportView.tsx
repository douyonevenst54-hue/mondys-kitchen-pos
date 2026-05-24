"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Printer,
  Utensils,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { paymentLabel } from "@/components/orders/StatsSummary";
import type { DailyReport } from "@/lib/orders";

type Settings = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxRate: number;
  currency: string;
  receiptFooter: string;
  timezone: string;
  defaultDeliveryFee: number;
};

type Props = {
  report: DailyReport;
  settings: Settings;
  prevDateParam: string;
  nextDateParam: string | null;
  todayDateParam: string;
  isToday: boolean;
};

export function DailyReportView({
  report,
  settings,
  prevDateParam,
  nextDateParam,
  todayDateParam,
  isToday,
}: Props) {
  function handlePrint() {
    window.print();
  }

  const hasOrders = report.orderCount > 0;
  const cashTotal =
    report.byPaymentMethod.find((p) => p.method === "CASH")?.total ?? 0;

  return (
    <main className="min-h-screen bg-mondy-cream py-6 print:bg-white print:py-0">
      {/* Screen-only toolbar */}
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Link
          href="/orders"
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={`/reports/daily?date=${prevDateParam}`}
            className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Link>
          {!isToday && (
            <Link
              href={`/reports/daily?date=${todayDateParam}`}
              className="rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
            >
              Today
            </Link>
          )}
          {nextDateParam && (
            <Link
              href={`/reports/daily?date=${nextDateParam}`}
              className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-mondy-red px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm transition hover:bg-mondy-red-dark"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* The report itself */}
      <article
        className="mx-auto max-w-3xl bg-white p-8 ring-1 ring-mondy-border print:max-w-none print:p-6 print:ring-0"
        id="printable-report"
      >
        {/* Header */}
        <header className="border-b border-mondy-border pb-5">
          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            Daily Report
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-mondy-ink">
            {settings.name}
          </h1>
          <p className="mt-2 font-display text-xl text-mondy-ink">
            {formatLongDate(report.date)}
          </p>
          <p className="mt-1 font-sans text-xs text-mondy-muted">
            Generated {formatDateTime(new Date())} · {settings.timezone}
          </p>
        </header>

        {!hasOrders ? (
          <section className="py-16 text-center">
            <p className="font-display text-lg text-mondy-muted">
              No orders on this day.
            </p>
          </section>
        ) : (
          <>
            {/* Top-line totals */}
            <section className="grid grid-cols-2 gap-4 border-b border-mondy-border py-5 sm:grid-cols-4">
              <Metric
                label="Revenue"
                value={formatMoney(report.revenue)}
                sublabel={
                  report.deliveryFeesTotal > 0
                    ? `incl. ${formatMoney(report.deliveryFeesTotal)} delivery`
                    : undefined
                }
                emphasis
              />
              <Metric
                label="Tips (to staff)"
                value={formatMoney(report.tipsTotal)}
              />
              <Metric
                label="Orders"
                value={String(report.orderCount)}
                sublabel={
                  report.voidedCount > 0
                    ? `${report.voidedCount} voided`
                    : undefined
                }
              />
              <Metric label="Tax collected" value={formatMoney(report.taxTotal)} />
            </section>

            {/* By order type */}
            <section className="border-b border-mondy-border py-5">
              <h2 className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-muted">
                By order type
              </h2>
              <ul className="mt-3 divide-y divide-mondy-border">
                {report.byOrderType.map((row) => (
                  <li
                    key={row.type}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      {row.type === "DINE_IN" ? (
                        <Utensils className="h-4 w-4 text-mondy-red-dark" />
                      ) : row.type === "DELIVERY" ? (
                        <Truck className="h-4 w-4 text-mondy-red-dark" />
                      ) : (
                        <ShoppingBag className="h-4 w-4 text-mondy-ink" />
                      )}
                      <span className="font-display text-sm font-semibold text-mondy-ink">
                        {row.type === "DINE_IN"
                          ? "Dine in"
                          : row.type === "DELIVERY"
                            ? "Delivery"
                            : "Takeout"}
                      </span>
                      <span className="font-sans text-xs text-mondy-muted">
                        ({row.count} {row.count === 1 ? "order" : "orders"})
                      </span>
                    </div>
                    <span className="font-display text-sm font-bold text-mondy-ink tabular">
                      {formatMoney(row.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* By payment method (cash drawer reconciliation) */}
            <section className="border-b border-mondy-border py-5">
              <h2 className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-muted">
                By payment method
              </h2>
              <ul className="mt-3 divide-y divide-mondy-border">
                {report.byPaymentMethod.map((row) => (
                  <li
                    key={row.method}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div>
                      <span className="font-display text-sm font-semibold text-mondy-ink">
                        {paymentLabel(row.method)}
                      </span>
                      <span className="ml-2 font-sans text-xs text-mondy-muted tabular">
                        × {row.count}
                      </span>
                    </div>
                    <span className="font-display text-sm font-bold text-mondy-ink tabular">
                      {formatMoney(row.total)}
                    </span>
                  </li>
                ))}
              </ul>
              {cashTotal > 0 && (
                <div className="mt-3 rounded-lg bg-mondy-yellow-soft/40 px-3 py-2 ring-1 ring-mondy-yellow-deep/30">
                  <p className="font-sans text-[11px] uppercase tracking-widest text-mondy-red-dark">
                    Cash drawer
                  </p>
                  <p className="mt-0.5 font-sans text-sm text-mondy-ink">
                    Expected{" "}
                    <span className="font-display font-bold tabular">
                      {formatMoney(cashTotal)}
                    </span>{" "}
                    in cash payments today. Reconcile against the drawer count
                    at shift close.
                  </p>
                </div>
              )}
            </section>

            {/* Top sellers */}
            {report.topSellers.length > 0 && (
              <section className="border-b border-mondy-border py-5">
                <h2 className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-muted">
                  Top sellers
                </h2>
                <ol className="mt-3 divide-y divide-mondy-border">
                  {report.topSellers.map((item, idx) => (
                    <li
                      key={item.name}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mondy-cream font-display text-xs font-bold text-mondy-ink tabular">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold text-mondy-ink">
                          {item.name}
                        </p>
                        <p className="font-sans text-xs text-mondy-muted">
                          {item.quantitySold} sold
                        </p>
                      </div>
                      <span className="font-display text-sm font-bold text-mondy-ink tabular">
                        {formatMoney(item.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Closed shifts (cash drawer reconciliation) */}
            {report.closedShifts.length > 0 && (
              <section className="py-5">
                <h2 className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-muted">
                  Closed shifts
                </h2>
                <ul className="mt-3 space-y-2">
                  {report.closedShifts.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg bg-mondy-cream px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold text-mondy-ink">
                          {s.staffName}
                        </span>
                        <span className="font-sans text-xs text-mondy-muted tabular">
                          {formatTime(s.startedAt)} – {formatTime(s.endedAt)}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-4 gap-2 font-sans text-[11px]">
                        <ShiftStat label="Opened" value={formatMoney(s.openingCash)} />
                        <ShiftStat label="Closed" value={formatMoney(s.closingCash)} />
                        <ShiftStat label="Expected" value={formatMoney(s.expectedCash)} />
                        <ShiftStat
                          label="Variance"
                          value={
                            (s.variance >= 0 ? "+" : "") + formatMoney(s.variance)
                          }
                          tone={
                            Math.abs(s.variance) < 0.01
                              ? "neutral"
                              : s.variance < 0
                                ? "negative"
                                : "positive"
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Signature area for the manager closing out the day */}
        <footer className="mt-6 border-t border-mondy-border pt-5">
          <p className="font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
            Reconciled by
          </p>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <div className="border-b border-black/70 pb-0.5 h-7">&nbsp;</div>
              <p className="mt-1 font-sans text-[10px] text-mondy-muted">
                Signature
              </p>
            </div>
            <div>
              <div className="border-b border-black/70 pb-0.5 h-7">&nbsp;</div>
              <p className="mt-1 font-sans text-[10px] text-mondy-muted">
                Date
              </p>
            </div>
          </div>
        </footer>
      </article>

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: white !important; }
          #printable-report { box-shadow: none; border: none; padding: 0; }
        }
      `}</style>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  sublabel,
  emphasis,
}: {
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
        {label}
      </p>
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

function ShiftStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "negative"
      ? "text-mondy-red-dark"
      : tone === "positive"
        ? "text-emerald-700"
        : "text-mondy-ink";
  return (
    <div>
      <p className="text-mondy-muted">{label}</p>
      <p className={`font-display font-bold tabular ${color}`}>{value}</p>
    </div>
  );
}

function formatLongDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}