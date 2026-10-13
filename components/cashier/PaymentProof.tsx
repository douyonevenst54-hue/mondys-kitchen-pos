"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { findCardPaymentForSale } from "@/app/api/orders/actions";

export type Verification = { kind: "clover"; paymentId: string } | { kind: "manager"; pin: string };

type Found = { id: string; card: string | null; at: number };

const POLL_MS = 3000;
const POLL_FOR_MS = 3 * 60_000;

/**
 * The card step on the register. The sale is only recorded when Clover shows
 * an approved payment for exactly this total (that no other sale has used),
 * or a manager approves it with their PIN.
 */
export function PaymentProof({
  method,
  total,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  method: string;
  total: number;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (v: Verification) => void;
}) {
  const viaClover = method === "CARD_PRESENT" || method === "CARD_MANUAL" || method === "MOBILE_WALLET";
  const [status, setStatus] = useState<"checking" | "waiting" | "found" | "off" | "error" | "stopped">(
    viaClover ? "checking" : "off",
  );
  const [found, setFound] = useState<Found | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(!viaClover);
  const [pin, setPin] = useState("");
  const started = useRef(0);

  const check = useCallback(async () => {
    try {
      const r = await findCardPaymentForSale(total);
      if (!r.enabled) return setStatus("off");
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

  const managerOnly = !viaClover || status === "off";
  const time = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(ms));

  return (
    <div className="p-6 font-sans">
      <p className="text-center text-sm text-mondy-muted">
        {managerOnly ? "Total" : "Charge this on the Clover device"}
      </p>
      <p className="text-center font-display text-5xl font-black tabular text-mondy-ink">{formatMoney(total)}</p>

      <div className="mt-4 min-h-16 rounded-xl bg-mondy-yellow-soft/40 p-4 ring-1 ring-mondy-yellow-deep/30" aria-live="polite">
        {managerOnly ? (
          <p className="flex items-start gap-2 text-sm text-mondy-ink">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mondy-red" aria-hidden />
            {viaClover
              ? "Clover isn't connected for card checks, so a manager has to approve card sales."
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

      {/* Manager approval: the only way to record a payment Clover can't confirm. */}
      <div className="mt-5 border-t border-mondy-border pt-4">
        {!showPin ? (
          <button type="button" onClick={() => setShowPin(true)} className="text-sm font-semibold text-mondy-red-dark underline-offset-2 hover:underline">
            Clover can&apos;t find it? Manager approval
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
    </div>
  );
}
