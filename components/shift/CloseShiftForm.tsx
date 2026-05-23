"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { closeShift, logoutAndRedirect } from "@/app/api/orders/actions";
import { formatMoney } from "@/lib/money";

type Props = {
  shiftId: string;
  openingCash: number;
  expectedCash: number;
  cashIn: number;
  staffName: string;
  startedAt: Date;
};

export function CloseShiftForm({
  shiftId,
  openingCash,
  expectedCash,
  cashIn,
  staffName,
  startedAt,
}: Props) {
  const router = useRouter();
  const [closing, setClosing] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [step, setStep] = useState<"enter" | "confirm" | "summary">("enter");
  const [summary, setSummary] = useState<{
    variance: number;
    closingCash: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const closingNum = parseFloat(closing) || 0;
  const previewVariance = Math.round((closingNum - expectedCash) * 100) / 100;

  function handleEnterContinue() {
    if (!closing) {
      setError("Enter your closing cash count");
      return;
    }
    setStep("confirm");
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await closeShift(shiftId, closingNum, notes || undefined);
      if (!result.ok) {
        setError(result.error);
        setStep("enter");
        return;
      }
      setSummary({
        variance: result.variance,
        closingCash: result.closingCash,
      });
      setStep("summary");
    });
  }

  function handleSignOut() {
    startTransition(async () => {
      await logoutAndRedirect();
    });
  }

  function handleBackToCashier() {
    router.push("/");
    router.refresh();
  }

  const elapsed = formatElapsed(startedAt);

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-mondy-border sm:p-8">
      {step === "enter" && (
        <>
          <header className="mb-5">
            <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
              Close Your Shift
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-mondy-ink">
              Count the cash drawer
            </h2>
            <p className="mt-1 font-sans text-xs text-mondy-muted">
              {staffName} · {elapsed} on shift
            </p>
          </header>

          <dl className="mb-5 space-y-1.5 rounded-xl bg-mondy-cream p-4">
            <Row label="Opening cash" value={formatMoney(openingCash)} />
            <Row label="Cash payments taken" value={`+ ${formatMoney(cashIn)}`} />
            <div className="my-1 h-px bg-mondy-border" />
            <Row
              label="Expected in drawer"
              value={formatMoney(expectedCash)}
              emphasis
            />
          </dl>

          <p className="mb-2 font-sans text-sm text-mondy-muted">
            Counted cash in the drawer:
          </p>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-mondy-muted">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={closing}
              onChange={(e) => {
                setError(null);
                setClosing(e.target.value.replace(/[^0-9.]/g, ""));
              }}
              placeholder="0.00"
              autoFocus
              className="h-16 w-full rounded-xl border border-mondy-border bg-white pl-10 pr-4 text-center font-display text-3xl font-bold tabular text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
          </div>

          {closing && (
            <VariancePreview variance={previewVariance} />
          )}

          {error && (
            <p className="mt-3 font-sans text-xs text-mondy-red-dark">{error}</p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={handleBackToCashier}
              className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
            >
              Not yet
            </button>
            <button
              type="button"
              onClick={handleEnterContinue}
              disabled={!closing}
              className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-sm font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
            >
              Review
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <header className="mb-5">
            <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
              Confirm
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-mondy-ink">
              {previewVariance === 0
                ? "Drawer balances"
                : previewVariance > 0
                  ? "Drawer is OVER"
                  : "Drawer is SHORT"}
            </h2>
          </header>

          <dl className="space-y-1.5 rounded-xl bg-mondy-cream p-4">
            <Row label="Expected" value={formatMoney(expectedCash)} />
            <Row label="Counted" value={formatMoney(closingNum)} />
            <div className="my-1 h-px bg-mondy-border" />
            <Row
              label="Variance"
              value={`${previewVariance >= 0 ? "+" : ""}${formatMoney(previewVariance)}`}
              tone={
                previewVariance === 0
                  ? "good"
                  : Math.abs(previewVariance) > 5
                    ? "bad"
                    : "warn"
              }
              emphasis
            />
          </dl>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              previewVariance !== 0
                ? "Optional: note what may explain the variance (tips out, misring, etc.)"
                : "Optional notes"
            }
            rows={3}
            className="mt-4 w-full resize-none rounded-xl border border-mondy-border bg-white px-3 py-2 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
          />

          {error && (
            <p className="mt-3 font-sans text-xs text-mondy-red-dark">{error}</p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("enter")}
              className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
            >
              Recount
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-sm font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
            >
              {isPending ? "Closing…" : "Close shift"}
            </button>
          </div>
        </>
      )}

      {step === "summary" && summary && (
        <div className="text-center">
          <div
            aria-hidden
            className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ${
              summary.variance === 0
                ? "bg-mondy-red/10 text-mondy-red"
                : Math.abs(summary.variance) > 5
                  ? "bg-mondy-red-dark/15 text-mondy-red-dark"
                  : "bg-mondy-yellow-soft text-mondy-red-dark"
            }`}
          >
            {summary.variance === 0 ? (
              <CheckCircle2 className="h-10 w-10" />
            ) : (
              <AlertTriangle className="h-10 w-10" />
            )}
          </div>

          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            Shift Closed
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-mondy-ink">
            {summary.variance === 0
              ? "Drawer balanced ✓"
              : `${summary.variance > 0 ? "Over" : "Short"} ${formatMoney(Math.abs(summary.variance))}`}
          </h2>
          <p className="mt-1 font-sans text-sm text-mondy-muted">
            Counted {formatMoney(summary.closingCash)} · Expected{" "}
            {formatMoney(expectedCash)}
          </p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={handleBackToCashier}
              className="flex-1 rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
            >
              Back to POS
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isPending}
              className="flex-1 rounded-xl bg-mondy-ink px-4 py-3 font-display text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "good" | "warn" | "bad";
}) {
  const valueColor =
    tone === "good"
      ? "text-mondy-red"
      : tone === "warn"
        ? "text-mondy-red-dark"
        : tone === "bad"
          ? "text-mondy-red-dark"
          : emphasis
            ? "text-mondy-red"
            : "text-mondy-ink";
  return (
    <div className="flex items-center justify-between">
      <dt
        className={
          emphasis
            ? "font-display text-base font-semibold text-mondy-ink"
            : "font-sans text-sm text-mondy-muted"
        }
      >
        {label}
      </dt>
      <dd
        className={`tabular ${
          emphasis
            ? `font-display text-xl font-bold ${valueColor}`
            : `font-sans text-sm font-medium ${valueColor}`
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function VariancePreview({ variance }: { variance: number }) {
  if (Math.abs(variance) < 0.01) {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-mondy-red/10 px-3 py-2 font-sans text-sm font-medium text-mondy-red">
        <CheckCircle2 className="h-4 w-4" />
        Drawer balances exactly
      </p>
    );
  }
  const big = Math.abs(variance) > 5;
  return (
    <p
      className={`mt-3 flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-sans text-sm font-medium ${
        big
          ? "bg-mondy-red-dark/15 text-mondy-red-dark"
          : "bg-mondy-yellow-soft/50 text-mondy-red-dark"
      }`}
    >
      <ArrowRightLeft className="h-4 w-4" />
      {variance > 0 ? "Over" : "Short"} by {formatMoney(Math.abs(variance))}
    </p>
  );
}

function formatElapsed(startedAt: Date | string): string {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const ms = Date.now() - start.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
