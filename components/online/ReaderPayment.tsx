"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cancelOnReader, chargeOnReader, readerStatus, testTap, type ReaderResult } from "@/app/online/reader-actions";

type View =
  | { name: "sending" }
  | { name: "waiting" }
  | { name: "succeeded"; card: string | null }
  | { name: "failed"; message: string }
  | { name: "canceled" }
  | { name: "error"; message: string };

const POLL_MS = 1500;

/**
 * Full-screen panel while the customer pays on the card reader. The total is
 * on the reader; this screen waits for Stripe to say the money went through.
 */
export function ReaderPayment({
  order,
  simulated,
  onPaid,
  onClose,
}: {
  order: { id: string; code: string; customerName: string | null; total: number };
  simulated: boolean;
  onPaid: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ name: "sending" });
  const [busy, setBusy] = useState(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const apply = useCallback((res: ReaderResult) => {
    if (!res.ok) return setView({ name: "error", message: res.error });
    const r = res.reader;
    if (r.state === "waiting") setView((v) => (v.name === "waiting" ? v : { name: "waiting" }));
    else if (r.state === "succeeded") setView({ name: "succeeded", card: r.card });
    else if (r.state === "failed") setView({ name: "failed", message: r.message });
    else setView({ name: "canceled" });
  }, []);

  const send = useCallback(async () => {
    setView({ name: "sending" });
    apply(await chargeOnReader(order.id));
  }, [apply, order.id]);

  // Send the amount to the reader once, when the panel opens.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    chargeOnReader(order.id).then(apply, () => setView({ name: "error", message: "Couldn't reach the server. Try again." }));
  }, [apply, order.id]);

  // While waiting, ask Stripe for news every 1.5 s.
  useEffect(() => {
    if (view.name !== "waiting") return;
    let stop = false;
    const t = setInterval(async () => {
      const res = await readerStatus(order.id).catch(() => null);
      if (!stop && res && viewRef.current.name === "waiting") {
        // A failed status check is not a failed payment: keep waiting.
        if (res.ok) apply(res);
      }
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [view.name, order.id, apply]);

  // Paid: show the confirmation briefly, then close.
  useEffect(() => {
    if (view.name !== "succeeded") return;
    const t = setTimeout(onPaid, 2500);
    return () => clearTimeout(t);
  }, [view.name, onPaid]);

  async function act(fn: () => Promise<ReaderResult>) {
    setBusy(true);
    try {
      apply(await fn());
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (view.name === "succeeded") return onPaid();
    if (view.name === "waiting" || view.name === "sending") {
      setBusy(true);
      const res = await cancelOnReader(order.id);
      setBusy(false);
      if (!res.ok) return setView({ name: "error", message: res.error });
      if (res.reader.state === "succeeded") return apply(res); // paid at the last second
    }
    onClose();
  }

  const btn =
    "rounded-2xl px-5 py-3.5 text-base font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:opacity-50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-mondy-ink/60 p-4 font-sans backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center text-mondy-ink shadow-2xl">
        <p className="text-sm text-mondy-muted">
          Order <span className="font-semibold tabular text-mondy-ink">{order.code}</span>
          {order.customerName && ` · ${order.customerName}`}
        </p>
        <p id="reader-title" className="mt-2 font-display text-5xl font-black tabular">
          {formatMoney(order.total)}
        </p>

        <div className="mt-5 min-h-28" aria-live="polite">
          {(view.name === "sending" || view.name === "waiting") && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mondy-cream text-mondy-red">
                {view.name === "sending" ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> : <CreditCard className="h-7 w-7" aria-hidden />}
              </span>
              <p className="mt-3 text-lg font-semibold">
                {view.name === "sending" ? "Sending the total to the reader…" : "Waiting for the customer"}
              </p>
              {view.name === "waiting" && (
                <p className="mt-1 text-sm text-mondy-muted">Ask them to tap, insert or swipe their card on the reader.</p>
              )}
            </>
          )}
          {view.name === "succeeded" && (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-green-700" aria-hidden />
              <p className="mt-3 text-lg font-bold text-green-800">Payment approved</p>
              <p className="mt-1 text-sm text-mondy-muted">{view.card ?? "Card"} · order marked paid</p>
            </>
          )}
          {view.name === "failed" && (
            <>
              <XCircle className="mx-auto h-14 w-14 text-mondy-red" aria-hidden />
              <p role="alert" className="mt-3 text-lg font-semibold text-mondy-red-dark">
                {view.message}
              </p>
            </>
          )}
          {view.name === "canceled" && <p className="pt-6 text-lg font-semibold">Payment cancelled on the reader.</p>}
          {view.name === "error" && (
            <p role="alert" className="pt-4 text-base font-semibold text-mondy-red-dark">
              {view.message}
            </p>
          )}
        </div>

        {simulated && view.name === "waiting" && (
          <div className="mt-5 rounded-2xl bg-mondy-yellow-soft p-3 ring-1 ring-mondy-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-mondy-muted">Test reader: pretend the customer…</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy} onClick={() => act(() => testTap(order.id, "approve"))} className={`${btn} flex-1 bg-white py-2.5 text-sm ring-1 ring-mondy-border hover:bg-mondy-cream`}>
                Taps a good card
              </button>
              <button type="button" disabled={busy} onClick={() => act(() => testTap(order.id, "decline"))} className={`${btn} flex-1 bg-white py-2.5 text-sm ring-1 ring-mondy-border hover:bg-mondy-cream`}>
                Card is declined
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {(view.name === "failed" || view.name === "canceled" || view.name === "error") && (
            <button type="button" disabled={busy} onClick={() => void send()} className={`${btn} flex-1 bg-mondy-red text-white hover:bg-mondy-red-dark`}>
              {view.name === "failed" ? "Try another card" : "Send to reader again"}
            </button>
          )}
          {view.name === "succeeded" ? (
            <button type="button" onClick={onPaid} className={`${btn} flex-1 bg-mondy-ink text-white hover:bg-black`}>
              Done
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className={`${btn} flex-1 bg-white ring-1 ring-mondy-border hover:bg-mondy-cream`}
            >
              {view.name === "waiting" || view.name === "sending" ? "Cancel payment" : "Close"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
