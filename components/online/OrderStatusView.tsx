"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, MapPin, Phone } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { refreshOnlineOrder, type ClientOrder } from "@/app/order/actions";

const STEPS = [
  { key: "SENT", label: "Order received" },
  { key: "READY", label: "Ready for pickup" },
  { key: "COMPLETED", label: "Picked up" },
] as const;

export function OrderStatusView({
  initial,
  restaurant,
  timezone,
}: {
  initial: ClientOrder;
  restaurant: { name: string; address: string | null; phone: string | null };
  timezone: string;
}) {
  const [order, setOrder] = useState(initial);
  const finished = order.status === "COMPLETED" || order.status === "VOIDED";

  useEffect(() => {
    if (finished) return;
    const t = setInterval(async () => {
      try {
        const next = await refreshOnlineOrder(order.id);
        if (next) setOrder(next);
      } catch {
        // Try again on the next tick.
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [order.id, finished]);

  const time = (d: Date | string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(
      new Date(d),
    );

  const reached = STEPS.findIndex((s) => s.key === order.status);
  const payAtCounter = order.payment?.status === "PENDING" && order.payment.method !== "STRIPE_ONLINE";

  let headline: string;
  let sub: string;
  if (order.status === "OPEN") {
    headline = "Waiting for your payment";
    sub = "This page updates by itself once your payment goes through.";
  } else if (order.status === "VOIDED") {
    headline = "This order was cancelled";
    sub = order.voidedReason ?? "Please call the restaurant if you have questions.";
  } else if (order.status === "READY") {
    headline = "Your order is ready";
    sub = "Come to the counter and give your order code.";
  } else if (order.status === "COMPLETED") {
    headline = "Picked up. Bon apeti!";
    sub = "Thank you for ordering from us.";
  } else {
    headline = "We're cooking your order";
    sub = order.estimatedReadyAt
      ? `It should be ready around ${time(order.estimatedReadyAt)}.`
      : "We'll have it ready soon.";
  }

  return (
    <div className="min-h-screen bg-mondy-cream text-mondy-ink">
      <header className="bg-mondy-red px-5 pb-8 pt-8 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-white/85">{restaurant.name}</p>
          <h1 className="mt-1 font-display text-3xl font-black leading-tight" aria-live="polite">
            {headline}
          </h1>
          <p className="mt-1.5 text-white/90">{sub}</p>

          <div className="mt-6 inline-block rounded-2xl bg-white px-5 py-3 text-mondy-ink">
            <p className="text-xs text-mondy-muted">Order code</p>
            <p className="font-display text-3xl font-black tracking-wide tabular">{order.code}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-16 pt-6">
        {order.status !== "OPEN" && order.status !== "VOIDED" && (
          <ol className="flex gap-2" aria-label="Order progress">
            {STEPS.map((s, i) => {
              const done = i <= reached;
              return (
                <li key={s.key} className="flex-1">
                  <div className={`h-1.5 rounded-full ${done ? "bg-mondy-red" : "bg-mondy-border"}`} />
                  <p className={`mt-2 flex items-center gap-1 text-xs ${done ? "font-semibold" : "text-mondy-muted"}`}>
                    {done && <Check className="h-3.5 w-3.5 text-mondy-red" aria-hidden />}
                    {s.label}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        {payAtCounter && order.status !== "VOIDED" && (
          <p className="mt-6 rounded-2xl bg-mondy-yellow-soft/60 px-4 py-3 text-sm">
            You&apos;ll pay {formatMoney(order.total)} at the counter, cash or card.
          </p>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <h2 className="font-display text-lg font-black">
            {order.customerName ? `Order for ${order.customerName}` : "Your order"}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items.map((it, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span>
                  {it.quantity} × {it.name}
                  {it.notes && <span className="block text-mondy-muted">{it.notes}</span>}
                </span>
                <span className="tabular">{formatMoney(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-mondy-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-mondy-muted">Subtotal</dt>
              <dd className="tabular">{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mondy-muted">Meals tax</dt>
              <dd className="tabular">{formatMoney(order.taxAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(order.total)}</dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 space-y-2 text-sm">
          {restaurant.address && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-mondy-muted" aria-hidden />
              {restaurant.address}
            </p>
          )}
          {restaurant.phone && (
            <a href={`tel:${restaurant.phone}`} className="flex items-center gap-2 underline-offset-2 hover:underline">
              <Phone className="h-4 w-4 text-mondy-muted" aria-hidden />
              {restaurant.phone}
            </a>
          )}
        </div>

        <p className="mt-8 text-sm text-mondy-muted">
          Keep this page open or bookmark it to check on your order.{" "}
          <Link href="/order" className="font-medium text-mondy-red underline-offset-2 hover:underline">
            Start a new order
          </Link>
        </p>
      </main>
    </div>
  );
}
