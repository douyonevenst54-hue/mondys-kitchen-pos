"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Ban, AlertTriangle } from "lucide-react";
import { voidOrder } from "@/app/api/orders/actions";
import { formatMoney } from "@/lib/money";

type Props = {
  orderId: string;
  orderNumber: number;
  orderTotal: number;
  onClose: () => void;
};

type Step = "reason" | "pin" | "confirm" | "done";

const COMMON_REASONS = [
  "Wrong order",
  "Customer complaint",
  "Test order",
  "Duplicate ring-up",
  "Kitchen error",
];

export function VoidOrderModal({
  orderId,
  orderNumber,
  orderTotal,
  onClose,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voidedBy, setVoidedBy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReasonContinue() {
    if (reason.trim().length < 3) {
      setError("Please enter a reason (at least 3 characters)");
      return;
    }
    setError(null);
    setStep("pin");
  }

  function handleVoidConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await voidOrder(orderId, reason.trim(), managerPin);
      if (!result.ok) {
        setError(result.error);
        setManagerPin("");
        return;
      }
      setVoidedBy(result.voidedByName);
      setStep("done");
    });
  }

  function handleDone() {
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-mondy-ink/50 p-4 backdrop-blur-sm"
      onClick={step === "done" ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step !== "done" && (
          <header className="mb-5 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-10 w-10 place-items-center rounded-xl bg-mondy-red/10 text-mondy-red-dark"
              >
                <Ban className="h-5 w-5" />
              </span>
              <div>
                <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
                  Void Order
                </p>
                <h3 className="mt-0.5 font-display text-xl font-bold text-mondy-ink">
                  Order #{orderNumber} · {formatMoney(orderTotal)}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-mondy-muted hover:bg-mondy-cream hover:text-mondy-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}

        {step === "reason" && (
          <>
            <div className="mb-3 rounded-xl bg-mondy-yellow-soft/40 p-3 ring-1 ring-mondy-yellow-deep/30">
              <p className="flex items-start gap-2 font-sans text-xs text-mondy-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mondy-red-dark" />
                <span>
                  Voiding refunds the payment and excludes the order from
                  revenue reports. This can&apos;t be undone.
                </span>
              </p>
            </div>

            <label className="block">
              <span className="font-sans text-xs font-medium text-mondy-muted">
                Reason
              </span>
              <textarea
                value={reason}
                onChange={(e) => {
                  setError(null);
                  setReason(e.target.value);
                }}
                placeholder="Explain why this order is being voided…"
                rows={3}
                autoFocus
                className="mt-1 w-full resize-none rounded-xl border border-mondy-border bg-white px-3 py-2 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              />
            </label>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMMON_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setReason(r);
                  }}
                  className="rounded-full bg-mondy-cream px-2.5 py-1 font-sans text-xs text-mondy-ink ring-1 ring-mondy-border transition hover:bg-white hover:ring-mondy-red/40"
                >
                  {r}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-3 font-sans text-xs text-mondy-red-dark">{error}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReasonContinue}
                className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-sm font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === "pin" && (
          <>
            <p className="mb-3 font-sans text-sm text-mondy-muted">
              Enter a manager or owner PIN to authorize this void.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={managerPin}
              onChange={(e) => {
                setError(null);
                setManagerPin(e.target.value.replace(/\D/g, "").slice(0, 8));
              }}
              placeholder="Manager PIN"
              autoFocus
              className="h-12 w-full rounded-xl border border-mondy-border bg-white px-4 text-center font-display text-xl tracking-[0.4em] text-mondy-ink focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />

            {error && (
              <p className="mt-3 font-sans text-xs text-mondy-red-dark">{error}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setManagerPin("");
                  setError(null);
                  setStep("reason");
                }}
                className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleVoidConfirm}
                disabled={isPending || managerPin.length < 4}
                className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-sm font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
              >
                {isPending ? "Voiding…" : "Authorize void"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center">
            <div
              aria-hidden
              className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-mondy-red/10 text-mondy-red-dark"
            >
              <Ban className="h-10 w-10" />
            </div>
            <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
              Order Voided
            </p>
            <h3 className="mt-2 font-display text-3xl font-bold text-mondy-ink">
              #{orderNumber}
            </h3>
            <p className="mt-2 font-sans text-sm text-mondy-muted">
              Authorized by {voidedBy} · Payment refunded
            </p>
            <button
              type="button"
              onClick={handleDone}
              className="mt-6 w-full rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark"
              autoFocus
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}