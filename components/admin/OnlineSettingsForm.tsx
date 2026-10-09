"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Power,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Store,
} from "lucide-react";
import {
  setOnlineOrderingPaused,
  setBusinessHours,
  setOnlinePrepTime,
  setRestaurantDetails,
} from "@/app/admin/online-settings/actions";

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

type Details = { phone: string | null; address: string | null; email: string | null };

type Props = {
  details: Details;
  paused: boolean;
  businessHours: Record<string, string | null> | null;
  prepTimeMinutes: number;
  card: CardInfo;
};

export function OnlineSettingsForm({
  details,
  paused: initialPaused,
  businessHours: initialHours,
  prepTimeMinutes: initialPrepTime,
  card,
}: Props) {
  return (
    <main className="min-h-screen bg-mondy-cream py-6">
      <div className="mx-auto max-w-2xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between">
          <Link
            href="/orders"
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to orders
          </Link>
          <h1 className="font-display text-xl font-bold text-mondy-ink">
            Online ordering
          </h1>
        </header>

        <CardStatusLine card={card} />
        <DetailsSection initial={details} />
        <PauseSection initialPaused={initialPaused} />
        <PrepTimeSection initialPrepTime={initialPrepTime} />
        <HoursSection initialHours={initialHours} />

        <p className="px-2 font-sans text-xs leading-relaxed text-mondy-muted">
          These settings control the public online-ordering page. Pausing
          stops new orders immediately. Hours determine when the menu shows
          &ldquo;We&rsquo;re closed&rdquo; vs accepting orders. Prep time is
          the estimate customers see when they place an order.
        </p>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card payments: on/off at a glance
// ─────────────────────────────────────────────────────────────────────────────

export type CardInfo = { enabled: boolean; mode: "test" | "live" | null; problem: string | null; webhook: boolean };

function CardStatusLine({ card }: { card: CardInfo }) {
  const ok = card.enabled && card.webhook;
  return (
    <section
      aria-label="Card payments"
      className={`rounded-2xl px-5 py-4 font-sans ring-1 ${ok ? "bg-white ring-mondy-border" : "bg-mondy-yellow ring-mondy-red/40"}`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-mondy-ink">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${card.enabled ? "bg-green-600" : "bg-mondy-red"}`} />
        {card.enabled
          ? `Card payments: on${card.mode === "test" ? " (test mode, no real charges)" : " (live)"}`
          : "Card payments: off. Customers only see Pay at pickup"}
      </p>
      {!card.enabled && card.problem && <p className="mt-1 text-xs text-mondy-ink">Reason: {card.problem}.</p>}
      {card.enabled && !card.webhook && (
        <p className="mt-1 text-xs text-mondy-ink">
          STRIPE_WEBHOOK_SECRET is missing, so paid orders may not reach the kitchen. Add it in Vercel and redeploy.
        </p>
      )}
      {!card.enabled && (
        <p className="mt-1 text-xs text-mondy-muted">Fix it in Vercel → Settings → Environment Variables (Production), then redeploy.</p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Restaurant details (receipts + online pages)
// ─────────────────────────────────────────────────────────────────────────────

function DetailsSection({ initial }: { initial: Details }) {
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await setRestaurantDetails({ phone, address, email });
      if (result.ok) {
        setPhone(result.phone ?? "");
        setAddress(result.address ?? "");
        setEmail(result.email ?? "");
        setMessage({ type: "success", text: "Saved. Receipts and the online order page now show these details." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  const field =
    "mt-1 h-11 w-full rounded-lg border border-mondy-border bg-white px-3 font-sans text-base text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40";

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-mondy-yellow-soft text-mondy-red-dark">
          <Store className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-display text-lg font-semibold text-mondy-ink">Restaurant details</p>
          <p className="mt-0.5 font-sans text-xs text-mondy-muted">
            Printed on every receipt and shown on the online order page, so customers can call or find you.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block font-sans text-sm font-medium text-mondy-ink">
          Phone for customers
          <input className={field} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(978) 880-2152" />
        </label>
        <label className="block font-sans text-sm font-medium text-mondy-ink">
          Address
          <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, MA" maxLength={160} />
        </label>
        <label className="block font-sans text-sm font-medium text-mondy-ink">
          Email <span className="font-normal text-mondy-muted">(optional)</span>
          <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@mondyskitchen.com" />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-mondy-red px-4 py-2.5 font-display text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40"
        >
          {isPending ? "Saving…" : "Save details"}
        </button>
      </div>
      {message && <StatusMessage message={message} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pause toggle
// ─────────────────────────────────────────────────────────────────────────────

function PauseSection({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  function handleToggle() {
    const next = !paused;
    setMessage(null);
    startTransition(async () => {
      const result = await setOnlineOrderingPaused(next);
      if (result.ok) {
        setPaused(next);
        setMessage({
          type: "success",
          text: next ? "Online ordering paused" : "Online ordering resumed",
        });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <section
      className={`rounded-2xl p-5 ring-1 transition-colors ${
        paused
          ? "bg-mondy-red/10 ring-mondy-red/30"
          : "bg-white ring-mondy-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            paused
              ? "bg-mondy-red text-white"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          <Power className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-mondy-red-dark">
            Status
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-mondy-ink">
            {paused ? "Online ordering is PAUSED" : "Accepting online orders"}
          </p>
          <p className="mt-1 font-sans text-xs text-mondy-muted">
            {paused
              ? "Customers see a \u201Ctemporarily not accepting orders\u201D message on the menu page."
              : "Customers can browse the menu and place pickup orders."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`shrink-0 rounded-xl px-4 py-2.5 font-display text-sm font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-60 ${
            paused
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-mondy-red text-white hover:bg-mondy-red-dark"
          }`}
        >
          {isPending
            ? "Saving..."
            : paused
              ? "Resume orders"
              : "Pause orders"}
        </button>
      </div>
      {message && <StatusMessage message={message} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prep time
// ─────────────────────────────────────────────────────────────────────────────

function PrepTimeSection({ initialPrepTime }: { initialPrepTime: number }) {
  const [minutes, setMinutes] = useState(initialPrepTime);
  const [savedMinutes, setSavedMinutes] = useState(initialPrepTime);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const dirty = minutes !== savedMinutes;

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await setOnlinePrepTime(minutes);
      if (result.ok) {
        setSavedMinutes(minutes);
        setMessage({ type: "success", text: `Prep time saved as ${minutes} min` });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-xl bg-mondy-yellow-soft text-mondy-red-dark"
        >
          <Clock className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-mondy-red-dark">
            Prep time estimate
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-mondy-ink">
            ~{minutes} minutes
          </p>
          <p className="mt-1 font-sans text-xs text-mondy-muted">
            Shown to customers as &ldquo;Ready in about {minutes} minutes&rdquo;
            on the confirmation screen.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="flex-1 accent-mondy-red"
        />
        <input
          type="number"
          min={5}
          max={120}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value) || 0)}
          className="h-10 w-20 rounded-lg border border-mondy-border bg-white px-3 text-center font-display text-base tabular text-mondy-ink focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending || minutes < 5 || minutes > 120}
          className="rounded-xl bg-mondy-red px-4 py-2.5 font-display text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40"
        >
          {isPending ? "..." : "Save"}
        </button>
      </div>
      {message && <StatusMessage message={message} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Business hours
// ─────────────────────────────────────────────────────────────────────────────

function HoursSection({
  initialHours,
}: {
  initialHours: Record<string, string | null> | null;
}) {
  // Seed defaults: each day initialized from the DB or a sensible default
  const seed: Record<string, { open: string; close: string; closed: boolean }> = {};
  for (const { key } of DAYS) {
    const v = initialHours?.[key];
    if (v === null || v === undefined) {
      seed[key] = { open: "11:00", close: "21:00", closed: true };
    } else {
      const [open, close] = v.split("-");
      seed[key] = { open: open ?? "11:00", close: close ?? "21:00", closed: false };
    }
  }

  const [hours, setHours] = useState(seed);
  const [savedHours, setSavedHours] = useState(seed);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const dirty = JSON.stringify(hours) !== JSON.stringify(savedHours);

  function updateDay(
    key: string,
    field: "open" | "close" | "closed",
    value: string | boolean,
  ) {
    setHours({
      ...hours,
      [key]: { ...hours[key], [field]: value },
    });
  }

  function handleSave() {
    setMessage(null);
    const payload: Record<string, string | null> = {};
    for (const { key } of DAYS) {
      payload[key] = hours[key].closed
        ? null
        : `${hours[key].open}-${hours[key].close}`;
    }
    startTransition(async () => {
      const result = await setBusinessHours(payload);
      if (result.ok) {
        setSavedHours(hours);
        setMessage({ type: "success", text: "Business hours saved" });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-xl bg-mondy-yellow-soft text-mondy-red-dark"
        >
          <Calendar className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-mondy-red-dark">
            Business hours
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-mondy-ink">
            When the menu is open online
          </p>
          <p className="mt-1 font-sans text-xs text-mondy-muted">
            Outside these hours, the menu shows &ldquo;We&rsquo;re closed&rdquo;
            and won&rsquo;t accept new orders.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {DAYS.map(({ key, label }) => (
          <div
            key={key}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-mondy-cream px-3 py-2.5"
          >
            <span className="w-24 font-display text-sm font-semibold text-mondy-ink">
              {label}
            </span>
            <label className="flex items-center gap-1.5 font-sans text-xs text-mondy-muted">
              <input
                type="checkbox"
                checked={hours[key].closed}
                onChange={(e) => updateDay(key, "closed", e.target.checked)}
                className="h-3.5 w-3.5 accent-mondy-red"
              />
              Closed
            </label>
            {!hours[key].closed && (
              <>
                <input
                  type="time"
                  value={hours[key].open}
                  onChange={(e) => updateDay(key, "open", e.target.value)}
                  className="h-8 rounded-md border border-mondy-border bg-white px-2 font-sans text-xs text-mondy-ink focus:outline-none focus:ring-1 focus:ring-mondy-red/40"
                />
                <span className="text-mondy-muted">–</span>
                <input
                  type="time"
                  value={hours[key].close}
                  onChange={(e) => updateDay(key, "close", e.target.value)}
                  className="h-8 rounded-md border border-mondy-border bg-white px-2 font-sans text-xs text-mondy-ink focus:outline-none focus:ring-1 focus:ring-mondy-red/40"
                />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="rounded-xl bg-mondy-red px-4 py-2.5 font-display text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40"
        >
          {isPending ? "Saving..." : "Save hours"}
        </button>
      </div>
      {message && <StatusMessage message={message} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared status message component
// ─────────────────────────────────────────────────────────────────────────────

function StatusMessage({
  message,
}: {
  message: { type: "success" | "error"; text: string };
}) {
  const isError = message.type === "error";
  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
        isError
          ? "bg-mondy-red/10 text-mondy-red-dark ring-1 ring-mondy-red/20"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      }`}
    >
      {isError ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="font-sans">{message.text}</span>
    </div>
  );
}