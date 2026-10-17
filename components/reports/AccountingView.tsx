"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Download, Percent } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { saveAccounts, saveTaxRate } from "@/app/reports/accounting/actions";
import type { AccountKey, AccountMap, DayTotals } from "@/lib/accounting";

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  sales: "Food sales (credit)",
  discounts: "Discounts & comps (debit)",
  delivery: "Delivery fees (credit)",
  tax: "Meals tax collected (credit)",
  tips: "Tips owed to staff (credit)",
  cash: "Cash taken (debit)",
  card: "Card payments, Clover (debit)",
  stripe: "Online card, Stripe (debit)",
  other: "Other payment types (debit)",
};

type Range = { from: string; to: string };

export function AccountingView({
  range,
  presets,
  taxRate,
  days,
  totals,
  accounts,
}: {
  range: Range;
  presets: (Range & { label: string })[];
  timezone: string;
  taxRate: number;
  days: DayTotals[];
  totals: DayTotals;
  accounts: AccountMap;
}) {
  const q = `from=${range.from}&to=${range.to}`;
  const usDate = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${m}/${d}/${y}`;
  };

  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/orders"
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border hover:bg-mondy-cream"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Orders
          </Link>
          <h1 className="font-display text-2xl font-bold">Tax &amp; accounting</h1>
        </header>

        <TaxCard initial={taxRate} />

        <section aria-labelledby="export-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <h2 id="export-title" className="font-display text-xl font-bold">
            Sales for your books
          </h2>
          <p className="mt-1 text-sm text-mondy-muted">
            Counted on the day the money came in. Refunds count on the day they were refunded.
          </p>

          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">
              From
              <input type="date" name="from" defaultValue={range.from} required className="mt-1 block h-11 rounded-lg px-3 ring-1 ring-mondy-border" />
            </label>
            <label className="text-sm font-medium">
              To
              <input type="date" name="to" defaultValue={range.to} required className="mt-1 block h-11 rounded-lg px-3 ring-1 ring-mondy-border" />
            </label>
            <button type="submit" className="h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white hover:bg-black">
              Show
            </button>
          </form>
          <nav aria-label="Quick ranges" className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => {
              const active = p.from === range.from && p.to === range.to;
              return (
                <Link
                  key={p.label}
                  href={`?from=${p.from}&to=${p.to}`}
                  aria-current={active ? "true" : undefined}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-sm ring-1 ${
                    active ? "bg-mondy-ink text-white ring-mondy-ink" : "ring-mondy-border hover:bg-mondy-cream"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Net sales", totals.netSales],
              ["Meals tax collected", totals.tax],
              ["Tips", totals.tips],
              ["Total collected", totals.collected],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-xl bg-mondy-cream/70 px-3 py-2.5">
                <dt className="text-xs text-mondy-muted">{label}</dt>
                <dd className="text-lg font-bold tabular">{formatMoney(v as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-mondy-muted">
            {totals.orders} orders paid · taxable sales {formatMoney(totals.taxableSales)} · refunds {formatMoney(totals.refunds)}
          </p>

          {days.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-mondy-border">
              <table className="w-full min-w-[640px] text-right text-sm tabular">
                <caption className="sr-only">Sales by day</caption>
                <thead className="bg-mondy-cream text-xs text-mondy-muted">
                  <tr>
                    {["Date", "Orders", "Net sales", "Meals tax", "Tips", "Cash", "Card", "Online (Stripe)", "Refunds"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-semibold first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mondy-border">
                  {days.map((d) => (
                    <tr key={d.day}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {usDate(d.day)}
                      </th>
                      <td className="px-3 py-2">{d.orders}</td>
                      <td className="px-3 py-2">{formatMoney(d.netSales)}</td>
                      <td className="px-3 py-2">{formatMoney(d.tax)}</td>
                      <td className="px-3 py-2">{formatMoney(d.tips)}</td>
                      <td className="px-3 py-2">{formatMoney(d.cash)}</td>
                      <td className="px-3 py-2">{formatMoney(d.card)}</td>
                      <td className="px-3 py-2">{formatMoney(d.stripe)}</td>
                      <td className="px-3 py-2">{d.refunds ? formatMoney(d.refunds) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <DownloadLink href={`/reports/accounting/export?kind=qbo&${q}`} title="QuickBooks journal" sub="One entry per day, ready to import" />
            <DownloadLink href={`/reports/accounting/export?kind=summary&${q}`} title="Daily sales summary" sub="For your accountant or meals tax return" />
            <DownloadLink href={`/reports/accounting/export?kind=orders&${q}`} title="Every payment" sub="One row per payment or refund" />
          </div>
        </section>

        <AccountsCard initial={accounts} />
      </div>
    </main>
  );
}

function DownloadLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <a
      href={href}
      download
      className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-mondy-border transition hover:ring-mondy-red/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
    >
      <Download className="mt-0.5 h-5 w-5 shrink-0 text-mondy-red" aria-hidden />
      <span>
        <span className="block font-semibold">{title} (CSV)</span>
        <span className="block text-xs text-mondy-muted">{sub}</span>
      </span>
    </a>
  );
}

function TaxCard({ initial }: { initial: number }) {
  const [pct, setPct] = useState(String(Math.round(initial * 10000) / 100));
  const [saved, setSaved] = useState(Math.round(initial * 10000) / 100);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const value = Number(pct);

  function save(v: number) {
    setMsg(null);
    startTransition(async () => {
      const r = await saveTaxRate(v);
      if (r.ok) {
        setSaved(v);
        setPct(String(v));
        setMsg({ ok: true, text: `Meals tax saved: ${v}%. New orders use it right away.` });
      } else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <section aria-labelledby="tax-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mondy-yellow-soft text-mondy-red-dark">
          <Percent className="h-5 w-5" />
        </span>
        <div>
          <h2 id="tax-title" className="font-display text-xl font-bold">
            Meals tax: {saved}%
          </h2>
          <p className="mt-1 text-sm text-mondy-muted">
            Charged on food after discounts, on the register and online. Not on the delivery fee or tips. Changing it
            only affects new orders; past orders keep the tax they were charged.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">
          Rate (%)
          <input
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))}
            className="mt-1 block h-11 w-28 rounded-lg px-3 text-right tabular ring-1 ring-mondy-border"
          />
        </label>
        <button
          type="button"
          disabled={pending || !(value >= 0 && value <= 20) || value === saved}
          onClick={() => save(value)}
          className="h-11 rounded-lg bg-mondy-red px-4 text-sm font-semibold text-white hover:bg-mondy-red-dark disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setPct("7")} className="h-11 rounded-lg px-3 text-sm ring-1 ring-mondy-border hover:bg-mondy-cream">
          7% (6.25% state + 0.75% local)
        </button>
        <button type="button" onClick={() => setPct("6.25")} className="h-11 rounded-lg px-3 text-sm ring-1 ring-mondy-border hover:bg-mondy-cream">
          6.25% (state only)
        </button>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function AccountsCard({ initial }: { initial: AccountMap }) {
  const [acc, setAcc] = useState<AccountMap>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <details className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <summary className="cursor-pointer font-display text-xl font-bold">QuickBooks setup</summary>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
        <li>In QuickBooks, make sure each account below exists in your Chart of Accounts (same spelling).</li>
        <li>Download the <strong>QuickBooks journal</strong> above for the days you want.</li>
        <li>
          QuickBooks: gear icon → <strong>Import data</strong> → <strong>Journal entries</strong> → upload the file and
          check the column matching.
        </li>
        <li>Import each day only once. Each day has its own journal number (SALES-YYYYMMDD) so duplicates are easy to spot.</li>
      </ol>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          startTransition(async () => {
            const r = await saveAccounts(acc);
            setMsg(r.ok ? { ok: true, text: "Account names saved" } : { ok: false, text: r.error });
          });
        }}
      >
        {(Object.keys(ACCOUNT_LABELS) as AccountKey[]).map((k) => (
          <label key={k} className="text-sm font-medium">
            {ACCOUNT_LABELS[k]}
            <input
              value={acc[k]}
              onChange={(e) => setAcc({ ...acc, [k]: e.target.value })}
              maxLength={100}
              required
              className="mt-1 block h-11 w-full rounded-lg px-3 ring-1 ring-mondy-border"
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className="h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save account names"}
          </button>
          {msg && (
            <span role={msg.ok ? "status" : "alert"} className={`ml-3 text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
              {msg.text}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
