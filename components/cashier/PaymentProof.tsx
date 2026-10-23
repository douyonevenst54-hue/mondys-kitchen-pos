"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { findCardPaymentForSale } from "@/app/api/orders/actions";
import {
  cancelSquareCharge,
  refundSquareCharge,
  registerCardMode,
  squareChargeStatus,
  startSquareCharge,
} from "@/app/api/orders/square-actions";

export type Verification =
  | { kind: "square"; checkoutId: string }
  | { kind: "clover"; paymentId: string }
  | { kind: "manager"; pin: string };

type Props = {
  method: string;
  total: number;
  /** Pickup orders: the amount is taken from this order on the server. */
  orderId?: string;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (v: Verification) => void;
  /** True while a card is on the Square Terminal or charged but not saved: don't let the window close. */
  onBusyChange?: (busy: boolean) => void;
};

const CARD_METHODS = new Set(["CARD_PRESENT", "CARD_MANUAL", "MOBILE_WALLET"]);

/**
 * The card step on the register and at pickup. The sale is only recorded when
 * the card processor shows the payment (the Square Terminal checkout, or a
 * matching Clover payment), or a manager approves it with their PIN.
 */
export function PaymentProof(p: Props) {
  const isCard = CARD_METHODS.has(p.method);
  const [mode, setMode] = useState<"loading" | "square" | "clover" | "manager">(isCard ? "loading" : "manager");

  useEffect(() => {
    if (!isCard) return;
    let live = true;
    registerCardMode()
      .then((m) => live && setMode(m))
      .catch(() => live && setMode("manager"));
    return () => {
      live = false;
    };
  }, [isCard]);

  if (mode === "loading") {
    return (
      <div className="p-6 font-sans">
        <Amount label="Total" total={p.total} />
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-mondy-muted" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Getting the card machine ready…
        </p>
      </div>
    );
  }
  if (mode === "square") return <SquareCharge {...p} />;
  return <CloverProof {...p} managerOnly={mode === "manager"} />;
}

function Amount({ label, total }: { label: string; total: number }) {
  return (
    <>
      <p className="text-center text-sm text-mondy-muted">{label}</p>
      <p className="text-center font-display text-5xl font-black tabular text-mondy-ink">{formatMoney(total)}</p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Square Terminal: the amount appears on the Terminal by itself.
// ─────────────────────────────────────────────────────────────────────────────

type SqState =
  | { s: "starting" }
  | { s: "waiting"; id: string; note?: string }
  | { s: "paid"; id: string; card: string | null }
  | { s: "canceled"; message: string }
  | { s: "error"; message: string; id?: string }
  | { s: "refund"; id: string; card: string | null };

function SquareCharge({ method, total, orderId, pending, error, onBack, onSubmit, onBusyChange }: Props) {
  const [st, setSt] = useState<SqState>({ s: "starting" });
  const [busy, setBusy] = useState(false);
  const submitted = useRef<string | null>(null);
  const live = useRef<string | null>(null); // checkout waiting on the Terminal
  const alive = useRef(true);

  // Money is on the Terminal or taken but not saved: the window must stay open.
  const locked = st.s === "starting" || st.s === "waiting" || st.s === "paid" || st.s === "refund" || (st.s === "error" && Boolean(st.id));
  useEffect(() => {
    onBusyChange?.(locked);
  }, [locked, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const start = useCallback(async () => {
    setSt({ s: "starting" });
    submitted.current = null;
    const r = await startSquareCharge({ total, orderId: orderId ?? null, manual: method === "CARD_MANUAL" }).catch(() => null);
    if (r?.ok && !alive.current) {
      // The window closed while the amount was being sent: take it back off.
      void cancelSquareCharge(r.checkoutId).catch(() => undefined);
      return;
    }
    if (!r) return setSt({ s: "error", message: "Couldn't reach the server. Try again." });
    if (!r.ok) return setSt({ s: "error", message: r.error });
    live.current = r.checkoutId;
    setSt({ s: "waiting", id: r.checkoutId });
  }, [total, orderId, method]);

  // Send the amount as soon as this screen opens.
  useEffect(() => {
    alive.current = true;
    const t = setTimeout(() => void start(), 0);
    return () => clearTimeout(t);
  }, [start]);

  // Closing the window while the Terminal still waits: take the amount off it.
  useEffect(
    () => () => {
      alive.current = false;
      if (live.current) void cancelSquareCharge(live.current).catch(() => undefined);
    },
    [],
  );

  // Check the Terminal every 1.5 s.
  const waitingId = st.s === "waiting" ? st.id : null;
  useEffect(() => {
    if (!waitingId) return;
    const t = setInterval(async () => {
      const r = await squareChargeStatus(waitingId).catch(() => null);
      if (!r || !r.ok) return; // a missed check is fine; try again
      if (r.charge.state === "paid") {
        live.current = null;
        setSt({ s: "paid", id: waitingId, card: r.charge.card });
      } else if (r.charge.state === "canceled") {
        live.current = null;
        setSt({ s: "canceled", message: r.charge.message });
      }
    }, 1500);
    return () => clearInterval(t);
  }, [waitingId]);

  // Paid: record the sale right away (once).
  useEffect(() => {
    if (st.s === "paid" && submitted.current !== st.id) {
      submitted.current = st.id;
      onSubmit({ kind: "square", checkoutId: st.id });
    }
  }, [st, onSubmit]);

  /** Only says "cancelled" when Square confirms it. */
  async function cancel(): Promise<"canceled" | "paid" | "waiting"> {
    if (st.s !== "waiting") return "waiting";
    const id = st.id;
    setBusy(true);
    const r = await cancelSquareCharge(id).catch(() => null);
    setBusy(false);
    if (r?.ok && r.charge.state === "paid") {
      live.current = null;
      setSt({ s: "paid", id, card: r.charge.card });
      return "paid";
    }
    if (r?.ok && r.charge.state === "canceled") {
      live.current = null;
      setSt({ s: "canceled", message: r.charge.message });
      return "canceled";
    }
    setSt({
      s: "waiting",
      id,
      note: r && !r.ok ? `${r.error} The amount may still be on the Terminal.` : "Couldn't cancel yet. The amount may still be on the Terminal: try again.",
    });
    return "waiting";
  }

  async function back() {
    if (st.s === "waiting") {
      if ((await cancel()) === "canceled") onBack();
      return;
    }
    // Charged but the sale isn't saved: offer the refund before leaving.
    if (st.s === "paid") return setSt({ s: "refund", id: st.id, card: st.card });
    if (st.s === "error" && st.id) return setSt({ s: "refund", id: st.id, card: null });
    onBack();
  }

  async function refund(id: string) {
    setBusy(true);
    const r = await refundSquareCharge(id).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setSt({ s: "canceled", message: "Refunded to the card." });
      return onBack();
    }
    setSt({ s: "error", message: r && !r.ok ? r.error : "Couldn't reach Square. Try the refund again.", id });
  }

  const primary =
    "flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark disabled:opacity-60";

  return (
    <div className="p-6 font-sans">
      <Amount label={method === "CARD_MANUAL" ? "Key in the card on the Square Terminal" : "On the Square Terminal"} total={total} />

      <div className="mt-4 min-h-16 rounded-xl bg-mondy-yellow-soft/40 p-4 ring-1 ring-mondy-yellow-deep/30" aria-live="polite">
        {st.s === "starting" ? (
          <p className="flex items-center gap-2 text-sm text-mondy-ink">
            <Loader2 className="h-4 w-4 animate-spin text-mondy-muted" aria-hidden />
            Sending {formatMoney(total)} to the Square Terminal…
          </p>
        ) : st.s === "waiting" ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-mondy-ink">
              <CreditCard className="h-5 w-5 shrink-0 text-mondy-red" aria-hidden />
              {method === "CARD_MANUAL"
                ? "Type the card number on the Square Terminal."
                : "Customer: tap, insert or swipe on the Square Terminal."}
            </p>
            {st.note && (
              <p role="alert" className="mt-2 text-sm text-mondy-red-dark">
                {st.note}
              </p>
            )}
          </>
        ) : st.s === "paid" ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            Square approved {st.card ?? "the card"}
            {pending ? ". Saving the sale…" : ""}
          </p>
        ) : st.s === "refund" ? (
          <p className="text-sm text-mondy-ink">
            The card was charged {formatMoney(total)}, but the sale isn&apos;t saved. Refund it to the card before going back?
          </p>
        ) : (
          <p role="alert" className="text-sm text-mondy-red-dark">
            {st.message}
          </p>
        )}
      </div>

      {error && st.s === "paid" && (
        <p role="alert" className="mt-3 text-sm text-mondy-red-dark">
          {error} The card was charged: fix it and tap Complete sale, or go Back to refund.
        </p>
      )}
      {error && st.s !== "paid" && (
        <p role="alert" className="mt-3 text-sm text-mondy-red-dark">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        {st.s === "refund" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSt({ s: "paid", id: st.id, card: st.card })}
              className="rounded-xl border border-mondy-border bg-white px-4 py-3 text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
            >
              Stay
            </button>
            <button type="button" disabled={busy} onClick={() => void refund(st.id)} className={primary}>
              {busy ? "Refunding…" : `Refund ${formatMoney(total)} and go back`}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || pending || st.s === "starting"}
              onClick={() => void back()}
              className="rounded-xl border border-mondy-border bg-white px-4 py-3 text-sm font-medium text-mondy-ink hover:bg-mondy-cream disabled:opacity-50"
            >
              Back
            </button>
            {st.s === "waiting" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="flex-1 rounded-xl bg-mondy-ink px-4 py-3 text-base font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {busy ? "Cancelling…" : "Cancel on Terminal"}
              </button>
            )}
            {st.s === "paid" && (
              <button type="button" disabled={pending} onClick={() => onSubmit({ kind: "square", checkoutId: st.id })} className={primary}>
                {pending ? "Recording…" : "Complete sale"}
              </button>
            )}
            {(st.s === "canceled" || (st.s === "error" && !st.id)) && (
              <button type="button" onClick={() => void start()} className={primary}>
                Send to Terminal again
              </button>
            )}
            {st.s === "error" && st.id && (
              <button type="button" disabled={busy} onClick={() => void refund(st.id!)} className={primary}>
                Try the refund again
              </button>
            )}
          </>
        )}
      </div>

      {(st.s === "canceled" || st.s === "error") && !("id" in st && st.id) && (
        <ManagerApproval label="Card taken another way? Manager approval" pending={pending} onSubmit={onSubmit} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Clover (or no card machine connected): find the payment, or manager PIN.
// ─────────────────────────────────────────────────────────────────────────────

type Found = { id: string; card: string | null; at: number };

const POLL_MS = 3000;
const POLL_FOR_MS = 3 * 60_000;

function CloverProof({
  method,
  total,
  pending,
  error,
  onBack,
  onSubmit,
  managerOnly: noClover,
}: Props & { managerOnly: boolean }) {
  const viaClover = CARD_METHODS.has(method) && !noClover;
  const [status, setStatus] = useState<"checking" | "waiting" | "found" | "error" | "stopped">("checking");
  const [found, setFound] = useState<Found | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const started = useRef(0);

  const check = useCallback(async () => {
    try {
      const r = await findCardPaymentForSale(total);
      if (r.error) {
        setLookupError(r.error);
        return setStatus("error");
      }
      if (r.payments[0]) {
        setFound(r.payments[0]);
        return setStatus("found");
      }
      setStatus(Date.now() - started.current > POLL_FOR_MS ? "stopped" : "waiting");
    } catch {
      setLookupError("Couldn't reach the server. Try again.");
      setStatus("error");
    }
  }, [total]);

  // Look right away, then every 3 s for up to 3 minutes.
  useEffect(() => {
    if (!viaClover) return;
    started.current = Date.now();
    const t = setTimeout(() => void check(), 0);
    return () => clearTimeout(t);
  }, [viaClover, check]);
  useEffect(() => {
    if (status !== "waiting") return;
    const t = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(t);
  }, [status, check]);

  const managerOnly = !viaClover;
  const time = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(ms));

  return (
    <div className="p-6 font-sans">
      <Amount label={managerOnly ? "Total" : "Charge this on the Clover device"} total={total} />

      <div className="mt-4 min-h-16 rounded-xl bg-mondy-yellow-soft/40 p-4 ring-1 ring-mondy-yellow-deep/30" aria-live="polite">
        {managerOnly ? (
          <p className="flex items-start gap-2 text-sm text-mondy-ink">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mondy-red" aria-hidden />
            {CARD_METHODS.has(method)
              ? "No card machine is connected (pair a Square Terminal in Square setup), so a manager has to approve card sales."
              : "Cash App, Zelle and other payments need a manager to check the money arrived and approve."}
          </p>
        ) : status === "found" && found ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            Clover approved {found.card ?? "a card payment"} at {time(found.at)}
          </p>
        ) : status === "error" ? (
          <p role="alert" className="text-sm text-mondy-red-dark">{lookupError}</p>
        ) : status === "stopped" ? (
          <p className="text-sm text-mondy-ink">
            No approved {formatMoney(total)} payment on Clover yet. Run it on the device, then check again.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-mondy-ink">
            <Loader2 className="h-4 w-4 animate-spin text-mondy-muted" aria-hidden />
            Waiting for Clover to show an approved {formatMoney(total)} payment…
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-mondy-red-dark">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-mondy-border bg-white px-4 py-3 text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
        >
          Back
        </button>
        {!managerOnly &&
          (status === "found" && found ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onSubmit({ kind: "clover", paymentId: found.id })}
              className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark disabled:opacity-60"
            >
              {pending ? "Recording…" : "Complete sale"}
            </button>
          ) : (
            <button
              type="button"
              disabled={status === "checking" || status === "waiting"}
              onClick={() => {
                started.current = Date.now();
                setStatus("checking");
                void check();
              }}
              className="flex-1 rounded-xl bg-mondy-ink px-4 py-3 text-base font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {status === "checking" || status === "waiting" ? "Checking Clover…" : "Check Clover again"}
            </button>
          ))}
      </div>

      <ManagerApproval label="Clover can't find it? Manager approval" open={managerOnly} pending={pending} onSubmit={onSubmit} />
    </div>
  );
}

/** Manager approval: the only way to record a payment the processor can't confirm. */
function ManagerApproval({
  label,
  open = false,
  pending,
  onSubmit,
}: {
  label: string;
  open?: boolean;
  pending: boolean;
  onSubmit: (v: Verification) => void;
}) {
  const [show, setShow] = useState(open);
  const [pin, setPin] = useState("");
  return (
    <div className="mt-5 border-t border-mondy-border pt-4">
      {!show ? (
        <button type="button" onClick={() => setShow(true)} className="text-sm font-semibold text-mondy-red-dark underline-offset-2 hover:underline">
          {label}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length >= 4) onSubmit({ kind: "manager", pin });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex-1">
            <span className="mb-1 block text-xs font-semibold text-mondy-ink">Manager PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-11 w-full rounded-xl bg-mondy-cream px-3 text-base tracking-widest ring-1 ring-mondy-border focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50"
            />
          </label>
          <button
            type="submit"
            disabled={pending || pin.length < 4}
            className="h-11 rounded-xl bg-mondy-red px-4 text-sm font-semibold text-white hover:bg-mondy-red-dark disabled:opacity-50"
          >
            {pending ? "Recording…" : "Approve payment"}
          </button>
        </form>
      )}
    </div>
  );
}
