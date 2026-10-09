"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { checkSelection, freeRule, groupRule, type OptionGroup } from "@/lib/options";

type Props = {
  name: string;
  description?: string | null;
  basePrice: number;
  groups: OptionGroup[];
  onAdd: (selectedIds: string[], summary: string, unitPrice: number) => void;
  onClose: () => void;
};

/**
 * Pick a dish's choices ("Hot or iced", "Protein", "Add-ins"…) before it goes
 * in the cart. Used by the register and the online order page.
 */
export function OptionPicker({ name, description, basePrice, groups, onAdd, onClose }: Props) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [showMissing, setShowMissing] = useState(false);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ids = useMemo(() => Object.values(picked).flat(), [picked]);
  const result = useMemo(() => checkSelection(groups, ids), [groups, ids]);
  // Running price even before required picks are made (same math as checkout).
  const partial = useMemo(() => checkSelection(groups.map((g) => ({ ...g, min: 0 })), ids), [groups, ids]);
  const extra = result.ok ? result.extra : partial.ok ? partial.extra : 0;
  const price = Math.round((basePrice + extra) * 100) / 100;
  const firstMissing = groups.find((g) => (picked[g.id]?.length ?? 0) < g.min);

  function toggle(g: OptionGroup, optionId: string) {
    setPicked((p) => {
      const cur = p[g.id] ?? [];
      if (cur.includes(optionId)) {
        return { ...p, [g.id]: cur.filter((id) => id !== optionId) };
      }
      if (g.max === 1) return { ...p, [g.id]: [optionId] }; // switch the single pick
      if (cur.length >= g.max) return p;
      return { ...p, [g.id]: [...cur, optionId] };
    });
  }

  function add() {
    if (!result.ok) {
      setShowMissing(true);
      if (firstMissing) groupRefs.current[firstMissing.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAdd(ids, result.summary, price);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="option-picker-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-mondy-ink/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white font-sans text-mondy-ink shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-mondy-border px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id="option-picker-title" className="font-display text-2xl font-black leading-tight">
              {name}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-mondy-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-mondy-muted transition hover:bg-mondy-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {groups.map((g) => {
            const cur = picked[g.id] ?? [];
            const done = cur.length >= g.min && cur.length > 0;
            const missing = showMissing && cur.length < g.min;
            const full = g.max > 1 && cur.length >= g.max;
            return (
              <section
                key={g.id}
                ref={(el) => {
                  groupRefs.current[g.id] = el;
                }}
                aria-labelledby={`grp-${g.id}`}
                className="border-b border-mondy-border/70 py-4 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id={`grp-${g.id}`} className="font-display text-lg font-bold">
                    {g.name}
                  </h3>
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      missing
                        ? "bg-mondy-red text-white"
                        : done && g.min > 0
                          ? "bg-mondy-cream text-mondy-ink"
                          : g.min > 0
                            ? "bg-mondy-yellow-soft/60 text-mondy-ink"
                            : "text-mondy-muted"
                    }`}
                  >
                    {done && g.min > 0 && <Check className="h-3 w-3" aria-hidden />}
                    {groupRule(g)}
                  </span>
                </div>
                {freeRule(g) && <p className="mt-0.5 text-sm text-mondy-muted">{freeRule(g)}</p>}
                <div role={g.max === 1 ? "radiogroup" : "group"} aria-labelledby={`grp-${g.id}`} className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.options.map((o) => {
                    const on = cur.includes(o.id);
                    const disabled = !on && full;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role={g.max === 1 ? "radio" : "checkbox"}
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => toggle(g, o.id)}
                        className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/60 disabled:opacity-40 ${
                          on ? "bg-mondy-red/[0.07] font-semibold ring-2 ring-mondy-red" : "bg-white ring-mondy-border hover:bg-mondy-cream"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`grid h-5 w-5 shrink-0 place-items-center ${g.max === 1 ? "rounded-full" : "rounded-md"} ${
                            on ? "bg-mondy-red text-white" : "ring-1 ring-mondy-border"
                          }`}
                        >
                          {on && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">{o.name}</span>
                        {o.price !== 0 && g.free === 0 && (
                          <span className="shrink-0 text-sm tabular text-mondy-muted">
                            {o.price > 0 ? "+" : "−"}
                            {formatMoney(Math.abs(o.price))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="border-t border-mondy-border px-5 py-4">
          {showMissing && !result.ok && (
            <p role="alert" className="mb-2 text-sm font-medium text-mondy-red-dark">
              {result.error}
            </p>
          )}
          <button
            type="button"
            onClick={add}
            className={`flex w-full items-center justify-between rounded-2xl px-5 py-4 text-base font-semibold text-white transition focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 ${
              result.ok ? "bg-mondy-red hover:bg-mondy-red-dark" : "bg-mondy-ink/70"
            }`}
          >
            <span>{result.ok ? "Add to order" : firstMissing ? `Choose ${firstMissing.name.toLowerCase()}` : "Add to order"}</span>
            <span className="tabular">{formatMoney(price)}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
