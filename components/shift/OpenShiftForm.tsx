"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { openShift } from "@/app/api/orders/actions";
import { formatMoney } from "@/lib/money";

const QUICK_AMOUNTS = [0, 50, 100, 150, 200, 300];

export function OpenShiftForm() {
  const router = useRouter();
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountNum = parseFloat(amount) || 0;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await openShift(amountNum);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-mondy-border sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-xl bg-mondy-red/10 text-mondy-red"
        >
          <Banknote className="h-6 w-6" />
        </span>
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            Open Your Shift
          </p>
          <h2 className="font-display text-2xl font-bold text-mondy-ink">
            Count the cash drawer
          </h2>
        </div>
      </div>

      <p className="mb-4 font-sans text-sm text-mondy-muted">
        Enter the total cash in the drawer right now. This will be your
        opening balance for shift reconciliation.
      </p>

      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-mondy-muted">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setError(null);
            setAmount(e.target.value.replace(/[^0-9.]/g, ""));
          }}
          placeholder="0.00"
          autoFocus
          className="h-16 w-full rounded-xl border border-mondy-border bg-white pl-10 pr-4 text-center font-display text-3xl font-bold tabular text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {QUICK_AMOUNTS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => {
              setError(null);
              setAmount(amt.toFixed(2));
            }}
            className="rounded-lg bg-mondy-cream py-2 font-display text-sm font-semibold text-mondy-ink ring-1 ring-mondy-border transition hover:bg-white"
          >
            ${amt}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 font-sans text-xs text-mondy-red-dark">{error}</p>
      )}

      <div className="mt-6 rounded-xl bg-mondy-yellow-soft/40 p-3 ring-1 ring-mondy-yellow-deep/30">
        <p className="font-sans text-xs text-mondy-ink">
          <span className="font-semibold">Opening with </span>
          <span className="font-display text-base font-bold text-mondy-red tabular">
            {formatMoney(amountNum)}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="mt-4 h-14 w-full rounded-xl bg-mondy-red font-display text-base font-semibold text-white shadow-sm transition-all duration-200 ease-mondy hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
      >
        {isPending ? "Opening shift…" : "Open shift & start ordering"}
      </button>
    </div>
  );
}
