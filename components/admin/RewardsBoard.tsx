"use client";
import { useBrand } from "@/components/brand/BrandProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Search, Star } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { adjustCustomerPoints, saveLoyaltySettings, stopCustomerEmails } from "@/app/rewards/actions";

type Settings = { enabled: boolean; pointsPerDollar: number; rewardPoints: number; rewardValue: number };
type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  points: number;
  optedIn: boolean;
  lastOrder: string | null;
  events: { id: string; when: string; points: number; note: string }[];
};

const field = "mt-1 block h-11 w-full rounded-lg bg-white px-3 ring-1 ring-mondy-border focus:outline-none focus:ring-2 focus:ring-mondy-red/40";

export function RewardsBoard({
  settings,
  customers,
  q,
  stats,
}: {
  settings: Settings;
  customers: Customer[];
  q: string;
  stats: { customers: number; points: number; optedIn: number };
}) {
  const brand = useBrand();
  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="font-display text-2xl font-bold">{brand.rewardsName}</h1>
        </header>

        <SettingsCard initial={settings} />

        <section aria-labelledby="cust-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <h2 id="cust-title" className="font-display text-xl font-bold">
            Customers
          </h2>
          <p className="mt-1 text-sm text-mondy-muted">
            {stats.customers} customers · {stats.points.toLocaleString()} points outstanding · {stats.optedIn} get specials by email
          </p>
          <form method="get" role="search" className="mt-3 flex gap-2">
            <label htmlFor="q" className="sr-only">
              Search by phone, name or email
            </label>
            <input id="q" name="q" defaultValue={q} placeholder="Phone, name or email" className={`${field} mt-0`} />
            <button type="submit" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white">
              <Search className="h-4 w-4" aria-hidden />
              Search
            </button>
          </form>
          {customers.length === 0 ? (
            <p className="mt-4 text-sm text-mondy-muted">{q ? "No customer matches that." : "No rewards customers yet."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-mondy-border">
              {customers.map((c) => (
                <CustomerRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SettingsCard({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [f, setF] = useState({
    enabled: initial.enabled,
    pointsPerDollar: String(initial.pointsPerDollar),
    rewardPoints: String(initial.rewardPoints),
    rewardValue: String(initial.rewardValue),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="rules-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <h2 id="rules-title" className="flex items-center gap-2 font-display text-xl font-bold">
        <Star className="h-5 w-5 text-mondy-red" aria-hidden />
        How points work
      </h2>
      <p className="mt-1 text-sm text-mondy-muted">
        Customers earn on food after discounts, once the order is paid and picked up (online) or paid (register). Cancelled
        orders take the points back.
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          startTransition(async () => {
            const r = await saveLoyaltySettings({
              enabled: f.enabled,
              pointsPerDollar: Number(f.pointsPerDollar),
              rewardPoints: Number(f.rewardPoints),
              rewardValue: Number(f.rewardValue),
            });
            setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          });
        }}
      >
        <label className="text-sm font-medium">
          Points per $1
          <input className={field} inputMode="numeric" value={f.pointsPerDollar} onChange={(e) => setF({ ...f, pointsPerDollar: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Points for a reward
          <input className={field} inputMode="numeric" value={f.rewardPoints} onChange={(e) => setF({ ...f, rewardPoints: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Reward value ($ off)
          <input className={field} inputMode="decimal" value={f.rewardValue} onChange={(e) => setF({ ...f, rewardValue: e.target.value })} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-mondy-red" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
          Rewards on (customers earn and can redeem)
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
          {msg && (
            <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
              {msg.text}
            </span>
          )}
        </div>
      </form>
      <p className="mt-2 text-xs text-mondy-muted">
        Right now: {f.rewardPoints} points = {formatMoney(Number(f.rewardValue) || 0)} off, about every{" "}
        {formatMoney(Math.round(Number(f.rewardPoints) / Math.max(1, Number(f.pointsPerDollar))))} spent.
      </p>
    </section>
  );
}

function CustomerRow({ c }: { c: Customer }) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="py-3">
      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
          <span>
            <span className="font-semibold">{c.name ?? "No name"}</span> <span className="tabular text-mondy-muted">{c.phone}</span>
            <span className="block text-xs text-mondy-muted">
              {c.lastOrder ? `Last order ${c.lastOrder}` : "No orders yet"}
              {c.optedIn ? " · gets specials" : ""}
            </span>
          </span>
          <span className="rounded-full bg-mondy-yellow-soft px-3 py-1 text-sm font-bold tabular">{c.points} pts</span>
        </summary>
        <div className="mt-2 space-y-3 rounded-xl bg-mondy-cream/60 p-3 text-sm">
          {c.events.length > 0 && (
            <ul className="space-y-1">
              {c.events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>
                    <span className="text-mondy-muted">{e.when}</span> {e.note}
                  </span>
                  <span className={`tabular font-semibold ${e.points < 0 ? "text-mondy-red-dark" : "text-emerald-800"}`}>
                    {e.points > 0 ? "+" : ""}
                    {e.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              startTransition(async () => {
                const r = await adjustCustomerPoints(c.id, Number(delta), note);
                setMsg(r.ok ? { ok: true, text: "Points updated" } : { ok: false, text: r.error });
                if (r.ok) {
                  setDelta("");
                  setNote("");
                  router.refresh();
                }
              });
            }}
          >
            <label className="w-28 font-medium">
              Points (+/−)
              <input className={field} inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} placeholder="-20" />
            </label>
            <label className="min-w-0 flex-1 font-medium">
              Reason
              <input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Missed points on Oct 12" />
            </label>
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-mondy-ink px-3 font-semibold text-white disabled:opacity-50">
              Adjust
            </button>
          </form>
          {c.optedIn && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await stopCustomerEmails(c.id);
                  setMsg(r.ok ? { ok: true, text: "Removed from specials emails" } : { ok: false, text: r.error });
                  router.refresh();
                })
              }
              className="min-h-11 rounded-lg px-3 font-semibold text-mondy-red-dark ring-1 ring-mondy-border"
            >
              Stop specials emails{c.email ? ` to ${c.email}` : ""}
            </button>
          )}
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}>
              {msg.text}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
