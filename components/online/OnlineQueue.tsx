"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bell, BellOff, CreditCard, Phone, Settings2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { fetchOnlineQueue, pickUpOnlineOrder, readyOnlineOrder } from "@/app/online/actions";
import type { QueueOrder } from "@/lib/online-orders";
import { ReaderPayment } from "./ReaderPayment";

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch {
    // Audio not available; the highlight still shows.
  }
}

export function OnlineQueue({
  initial,
  timezone,
  acceptingOrders,
  closedMessage,
  canManage,
  reader,
}: {
  initial: QueueOrder[];
  timezone: string;
  acceptingOrders: boolean;
  closedMessage: string | null;
  canManage: boolean;
  reader: { paired: boolean; simulated: boolean };
}) {
  const [orders, setOrders] = useState(initial);
  const [soundOn, setSoundOn] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const known = useRef(new Set(initial.map((o) => o.id)));
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const next = await fetchOnlineQueue();
        if (!next) return;
        const fresh = next.filter((o) => !known.current.has(o.id)).map((o) => o.id);
        next.forEach((o) => known.current.add(o.id));
        if (fresh.length > 0) {
          setNewIds((s) => new Set([...s, ...fresh]));
          if (soundRef.current) chime();
        }
        setOrders(next);
      } catch {
        // Network blip; try again next tick.
      }
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  const time = (d: Date | string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(
      new Date(d),
    );

  const toMake = orders.filter((o) => o.status === "SENT");
  const ready = orders.filter((o) => o.status === "READY");
  const done = orders.filter((o) => o.status === "COMPLETED").reverse();

  function replace(updated: QueueOrder) {
    setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
    setNewIds((s) => {
      const c = new Set(s);
      c.delete(updated.id);
      return c;
    });
  }

  return (
    <main className="min-h-screen bg-mondy-cream">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Register
            </Link>
            <h1 className="font-display text-xl font-black text-mondy-ink">Online orders</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSoundOn((v) => !v);
                if (!soundOn) chime();
              }}
              aria-pressed={soundOn}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-sans text-xs font-semibold ring-1 transition ${
                soundOn
                  ? "bg-mondy-ink text-white ring-mondy-ink"
                  : "bg-white text-mondy-ink ring-mondy-border hover:bg-mondy-cream"
              }`}
            >
              {soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              {soundOn ? "Sound on" : "Turn on sound"}
            </button>
            {canManage && (
              <Link
                href="/admin/online-settings"
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Hours &amp; pause
              </Link>
            )}
            {canManage && (
              <Link
                href="/admin/card-reader"
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
                Card reader
              </Link>
            )}
          </div>
        </div>
        {!acceptingOrders && (
          <p className="bg-mondy-ink px-4 py-2 text-center font-sans text-sm text-white">
            Not taking online orders right now. {closedMessage}
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
        <Column title="To make" count={toMake.length} empty="No orders waiting.">
          {toMake.map((o) => (
            <OrderCard key={o.id} order={o} isNew={newIds.has(o.id)} time={time} onUpdated={replace} reader={reader} />
          ))}
        </Column>
        <Column title="Ready for pickup" count={ready.length} empty="Nothing waiting on the shelf.">
          {ready.map((o) => (
            <OrderCard key={o.id} order={o} isNew={false} time={time} onUpdated={replace} reader={reader} />
          ))}
        </Column>
      </div>

      {done.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
          <h2 className="font-display text-lg font-bold text-mondy-muted">Picked up today</h2>
          <ul className="mt-2 divide-y divide-mondy-border rounded-xl bg-white font-sans text-sm ring-1 ring-mondy-border">
            {done.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="font-semibold tabular">{o.code}</span>{" "}
                  <span className="text-mondy-muted">{o.customerName}</span>
                </span>
                <span className="tabular text-mondy-muted">
                  {formatMoney(o.total)} · {o.completedAt ? time(o.completedAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Column({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 font-display text-lg font-bold text-mondy-red-dark">
        {title}
        <span className="font-sans text-sm font-semibold text-mondy-muted tabular">{count}</span>
      </h2>
      <div className="space-y-3">
        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-mondy-border px-4 py-8 text-center font-sans text-sm text-mondy-muted">
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  isNew,
  time,
  onUpdated,
  reader,
}: {
  order: QueueOrder;
  isNew: boolean;
  time: (d: Date | string) => string;
  onUpdated: (o: QueueOrder) => void;
  reader: { paired: boolean; simulated: boolean };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choosingPayment, setChoosingPayment] = useState(false);
  const [charging, setCharging] = useState(false);

  function markReady() {
    setError(null);
    startTransition(async () => {
      const res = await readyOnlineOrder(order.id);
      if (!res.ok) setError(res.error);
      else onUpdated({ ...order, status: "READY" });
    });
  }

  function pickUp(paidWith: "CASH" | "CARD_PRESENT" | null) {
    setError(null);
    startTransition(async () => {
      const res = await pickUpOnlineOrder(order.id, paidWith);
      if (!res.ok) setError(res.error);
      else onUpdated({ ...order, status: "COMPLETED", paid: true, completedAt: new Date() });
    });
  }

  const btn =
    "flex-1 rounded-xl px-4 py-3 font-sans text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 disabled:opacity-50";

  return (
    <article
      className={`rounded-2xl bg-white p-4 font-sans ring-1 ${
        isNew ? "ring-2 ring-mondy-yellow-deep" : "ring-mondy-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-black tabular text-mondy-ink">{order.code}</p>
          <p className="text-sm text-mondy-ink">{order.customerName}</p>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="mt-0.5 flex items-center gap-1 text-xs text-mondy-muted hover:text-mondy-ink"
            >
              <Phone className="h-3 w-3" aria-hidden />
              {order.customerPhone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
            </a>
          )}
        </div>
        <div className="text-right text-xs text-mondy-muted">
          <p>Placed {time(order.createdAt)}</p>
          {order.estimatedReadyAt && order.status === "SENT" && (
            <p className="font-semibold text-mondy-ink">Due {time(order.estimatedReadyAt)}</p>
          )}
          <p
            className={`mt-1 inline-block rounded-full px-2 py-0.5 font-semibold ${
              order.paid ? "bg-mondy-cream text-mondy-ink" : "bg-mondy-red text-white"
            }`}
          >
            {order.paid ? "Paid" : `Collect ${formatMoney(order.total)}`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-mondy-border pt-3 text-[15px] text-mondy-ink">
        {order.items.map((it, i) => (
          <li key={i}>
            <span className="font-semibold tabular">{it.quantity}×</span> {it.name}
            {it.notes && <span className="ml-1 text-sm text-mondy-red-dark">({it.notes})</span>}
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="mt-2 rounded-lg bg-mondy-yellow-soft/50 px-3 py-2 text-sm text-mondy-ink">
          {order.notes}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-mondy-red/10 px-3 py-2 text-sm text-mondy-red-dark">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {order.status === "SENT" && (
          <button type="button" onClick={markReady} disabled={pending} className={`${btn} bg-mondy-red text-white hover:bg-mondy-red-dark`}>
            Mark ready
          </button>
        )}
        {order.status === "READY" && !choosingPayment && (
          <button
            type="button"
            onClick={() => (order.paid ? pickUp(null) : setChoosingPayment(true))}
            disabled={pending}
            className={`${btn} bg-mondy-ink text-white hover:bg-black`}
          >
            Picked up
          </button>
        )}
        {order.status === "READY" && choosingPayment && (
          <div className="flex w-full flex-col gap-2">
            {reader.paired && (
              <button
                type="button"
                onClick={() => setCharging(true)}
                disabled={pending}
                className={`${btn} flex items-center justify-center gap-2 bg-mondy-red text-white hover:bg-mondy-red-dark`}
              >
                <CreditCard className="h-4 w-4" aria-hidden />
                Charge {formatMoney(order.total)} on card reader
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => pickUp("CASH")} disabled={pending} className={`${btn} bg-mondy-ink text-white hover:bg-black`}>
                Paid cash
              </button>
              <button
                type="button"
                onClick={() => pickUp("CARD_PRESENT")}
                disabled={pending}
                className={`${btn} ${reader.paired ? "bg-white text-mondy-ink ring-1 ring-mondy-border hover:bg-mondy-cream" : "bg-mondy-ink text-white hover:bg-black"}`}
              >
                {reader.paired ? "Card, other machine" : "Paid card"}
              </button>
              <button
                type="button"
                onClick={() => setChoosingPayment(false)}
                disabled={pending}
                className={`${btn} flex-none bg-white text-mondy-ink ring-1 ring-mondy-border hover:bg-mondy-cream`}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
      {charging && (
        <ReaderPayment
          order={{ id: order.id, code: order.code, customerName: order.customerName, total: order.total }}
          simulated={reader.simulated}
          onClose={() => setCharging(false)}
          onPaid={() => {
            setCharging(false);
            setChoosingPayment(false);
            onUpdated({ ...order, status: "COMPLETED", paid: true, completedAt: new Date() });
          }}
        />
      )}
    </article>
  );
}
