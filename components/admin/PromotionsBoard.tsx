"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Mail, Plus, Tag } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { savePromo, sendCampaignNow, sendCampaignTest, setPromoActive, type PromoInput } from "@/app/promotions/actions";

export type PromoRow = {
  id: string;
  name: string;
  code: string;
  type: "PERCENT" | "FIXED_AMOUNT";
  value: number;
  minSubtotal: number | null;
  startsOn: string;
  endsOn: string;
  maxUses: number | null;
  oncePerCustomer: boolean;
  online: boolean;
  bannerText: string;
  isActive: boolean;
  state: "live" | "scheduled" | "expired" | "off";
  uses: number;
  given: number;
};

type CampaignRow = {
  id: string;
  subject: string;
  code: string | null;
  when: string;
  recipients: number;
  sent: number;
  failed: number;
  finished: boolean;
};

const field = "mt-1 block h-11 w-full rounded-lg bg-white px-3 ring-1 ring-mondy-border focus:outline-none focus:ring-2 focus:ring-mondy-red/40";
const STATE_STYLE = {
  live: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-sky-100 text-sky-800",
  expired: "bg-mondy-cream text-mondy-muted",
  off: "bg-mondy-cream text-mondy-muted",
};
const deal = (p: Pick<PromoRow, "type" | "value" | "minSubtotal">) =>
  `${p.type === "PERCENT" ? `${p.value}% off` : `${formatMoney(p.value)} off`}${p.minSubtotal ? ` orders ${formatMoney(p.minSubtotal)}+` : ""}`;
const usDate = (ymd: string) => (ymd ? `${ymd.slice(5, 7)}/${ymd.slice(8)}` : "");

export function PromotionsBoard({
  promos,
  campaigns,
  audience,
  email,
}: {
  promos: PromoRow[];
  campaigns: CampaignRow[];
  audience: number;
  email: { enabled: boolean; problem: string | null };
}) {
  const [editing, setEditing] = useState<PromoRow | "new" | null>(null);

  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="font-display text-2xl font-bold">Promotions &amp; emails</h1>
        </header>

        <section aria-labelledby="codes-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <div className="flex items-center justify-between gap-3">
            <h2 id="codes-title" className="font-display text-xl font-bold">
              Promo codes
            </h2>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-mondy-red px-3 text-sm font-semibold text-white hover:bg-mondy-red-dark"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New code
            </button>
          </div>
          <p className="mt-1 text-sm text-mondy-muted">
            Live codes show in the register&apos;s Discount list. Codes marked &ldquo;online&rdquo; can also be typed at
            online checkout.
          </p>

          {editing && (
            <PromoForm initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}

          {promos.length === 0 ? (
            <p className="mt-4 text-sm text-mondy-muted">No promo codes yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-mondy-border">
              {promos.map((p) => (
                <PromoItem key={p.id} p={p} onEdit={() => setEditing(p)} />
              ))}
            </ul>
          )}
        </section>

        <CampaignForm promos={promos.filter((p) => p.state === "live" && p.online)} audience={audience} email={email} />

        {campaigns.length > 0 && (
          <section aria-labelledby="sent-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <h2 id="sent-title" className="font-display text-xl font-bold">
              Sent emails
            </h2>
            <ul className="mt-3 divide-y divide-mondy-border text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">{c.subject}</span>
                    {c.code && <span className="text-mondy-muted"> · {c.code}</span>}
                    <span className="block text-xs text-mondy-muted">{c.when}</span>
                  </span>
                  <span className="tabular text-mondy-muted">
                    {c.finished ? `${c.sent} sent` : `sending… ${c.sent}/${c.recipients}`}
                    {c.failed > 0 && <span className="text-mondy-red-dark"> · {c.failed} failed</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function PromoItem({ p, onEdit }: { p: PromoRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Tag className="h-4 w-4 shrink-0 text-mondy-red" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="rounded bg-mondy-cream px-1.5 py-0.5 tracking-wide">{p.code}</span> {p.name}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[p.state]}`}>{p.state}</span>
        </p>
        <p className="text-sm text-mondy-muted">
          {deal(p)} · {p.online ? "online + register" : "register only"}
          {p.startsOn || p.endsOn ? ` · ${usDate(p.startsOn) || "now"}–${usDate(p.endsOn) || "no end"}` : ""}
          {p.maxUses ? ` · max ${p.maxUses}` : ""}
          {p.oncePerCustomer ? " · once per customer" : ""}
        </p>
        <p className="text-xs text-mondy-muted">
          Used {p.uses} time{p.uses === 1 ? "" : "s"} · {formatMoney(p.given)} given
          {p.bannerText ? ` · banner: “${p.bannerText}”` : ""}
        </p>
      </div>
      <button type="button" onClick={onEdit} className="min-h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream">
        Edit<span className="sr-only"> {p.code}</span>
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setPromoActive(p.id, !p.isActive);
            router.refresh();
          })
        }
        className="min-h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream disabled:opacity-50"
      >
        {p.isActive ? "Turn off" : "Turn on"}
        <span className="sr-only"> {p.code}</span>
      </button>
    </li>
  );
}

function PromoForm({ initial, onDone }: { initial: PromoRow | null; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    type: initial?.type ?? ("PERCENT" as "PERCENT" | "FIXED_AMOUNT"),
    value: initial ? String(initial.value) : "",
    minSubtotal: initial?.minSubtotal ? String(initial.minSubtotal) : "",
    startsOn: initial?.startsOn ?? "",
    endsOn: initial?.endsOn ?? "",
    maxUses: initial?.maxUses ? String(initial.maxUses) : "",
    oncePerCustomer: initial?.oncePerCustomer ?? false,
    online: initial?.online ?? true,
    bannerText: initial?.bannerText ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: PromoInput = {
      id: initial?.id ?? null,
      name: f.name,
      code: f.code,
      type: f.type,
      value: Number(f.value),
      minSubtotal: f.minSubtotal ? Number(f.minSubtotal) : null,
      startsOn: f.startsOn,
      endsOn: f.endsOn,
      maxUses: f.maxUses ? Number(f.maxUses) : null,
      oncePerCustomer: f.oncePerCustomer,
      online: f.online,
      bannerText: f.bannerText,
    };
    startTransition(async () => {
      const r = await savePromo(input);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl bg-mondy-cream/60 p-4 sm:grid-cols-2" aria-label={initial ? `Edit ${initial.code}` : "New promo code"}>
      <label className="text-sm font-medium">
        Name (for staff)
        <input className={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Fall special" required maxLength={60} />
      </label>
      <label className="text-sm font-medium">
        Code customers type
        <input
          className={`${field} uppercase tracking-wide`}
          value={f.code}
          onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="FALL10"
          required
          maxLength={20}
        />
      </label>
      <fieldset className="text-sm font-medium">
        <legend>Discount</legend>
        <div className="mt-1 flex gap-2">
          <select className={`${field} mt-0 w-28`} value={f.type} onChange={(e) => set("type", e.target.value as "PERCENT" | "FIXED_AMOUNT")} aria-label="Discount type">
            <option value="PERCENT">% off</option>
            <option value="FIXED_AMOUNT">$ off</option>
          </select>
          <input className={`${field} mt-0`} inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder={f.type === "PERCENT" ? "10" : "5.00"} required aria-label="Amount off" />
        </div>
      </fieldset>
      <label className="text-sm font-medium">
        Minimum order ($, optional)
        <input className={field} inputMode="decimal" value={f.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} placeholder="20.00" />
      </label>
      <label className="text-sm font-medium">
        Starts (optional)
        <input type="date" className={field} value={f.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        Ends (optional, last day included)
        <input type="date" className={field} value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        Total uses allowed (optional)
        <input className={field} inputMode="numeric" value={f.maxUses} onChange={(e) => set("maxUses", e.target.value.replace(/\D/g, ""))} placeholder="100" />
      </label>
      <div className="space-y-1 pt-5 text-sm">
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-mondy-red" checked={f.online} onChange={(e) => set("online", e.target.checked)} />
          Customers can use it online
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-mondy-red" checked={f.oncePerCustomer} onChange={(e) => set("oncePerCustomer", e.target.checked)} />
          Once per customer (by phone)
        </label>
      </div>
      <label className="text-sm font-medium sm:col-span-2">
        Banner on the online menu (optional)
        <input className={field} value={f.bannerText} onChange={(e) => set("bannerText", e.target.value)} maxLength={90} placeholder="Fall special: 10% off this weekend!" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-mondy-red-dark sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : initial ? "Save changes" : "Create code"}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg px-4 text-sm ring-1 ring-mondy-border">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CampaignForm({ promos, audience, email }: { promos: PromoRow[]; audience: number; email: { enabled: boolean; problem: string | null } }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [testTo, setTestTo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const input = { subject, message, discountId: discountId || null };

  return (
    <section aria-labelledby="campaign-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <h2 id="campaign-title" className="flex items-center gap-2 font-display text-xl font-bold">
        <Mail className="h-5 w-5 text-mondy-red" aria-hidden />
        Email a promotion
      </h2>
      <p className="mt-1 text-sm text-mondy-muted">
        Goes to the {audience} customer{audience === 1 ? "" : "s"} who asked for specials at checkout. Every email has an
        unsubscribe link. For the PS Club corner on the order page, use PS Club posts.
      </p>
      {!email.enabled && (
        <p className="mt-3 rounded-lg bg-mondy-yellow-soft/60 px-3 py-2 text-sm">Email is off: {email.problem}. Set it up in Vercel to send.</p>
      )}
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">
          Subject
          <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Griot Friday is back 🔥" />
        </label>
        <label className="block text-sm font-medium">
          Message
          <textarea
            className={`${field} h-36 py-2`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={3000}
            placeholder={"Hi neighbors!\n\nThis Friday only: griot with diri ak pwa and pikliz…"}
          />
        </label>
        <label className="block text-sm font-medium">
          Feature a promo code (optional)
          <select className={field} value={discountId} onChange={(e) => setDiscountId(e.target.value)}>
            <option value="">None</option>
            {promos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}: {deal(p)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Send a test to
            <input className={field} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          </label>
          <button
            type="button"
            disabled={pending || !email.enabled}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const r = await sendCampaignTest(input, testTo);
                setMsg(r.ok ? { ok: true, text: `Test sent to ${testTo}` } : { ok: false, text: r.error });
              })
            }
            className="min-h-11 rounded-lg px-4 text-sm font-semibold ring-1 ring-mondy-border disabled:opacity-50"
          >
            Send test
          </button>
        </div>
        <button
          type="button"
          disabled={pending || !email.enabled || audience === 0}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            startTransition(async () => {
              setMsg(null);
              const r = await sendCampaignNow(input);
              setConfirming(false);
              if (r.ok) {
                setMsg({ ok: true, text: `Sending to ${audience} customers. Progress shows under Sent emails.` });
                setSubject("");
                setMessage("");
                setDiscountId("");
                router.refresh();
              } else setMsg({ ok: false, text: r.error });
            });
          }}
          className={`min-h-12 w-full rounded-xl px-4 font-semibold text-white disabled:opacity-50 ${confirming ? "bg-mondy-red-dark" : "bg-mondy-red hover:bg-mondy-red-dark"}`}
        >
          {pending ? "Sending…" : confirming ? `Tap again to send to ${audience} customers` : `Send to ${audience} customers`}
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
