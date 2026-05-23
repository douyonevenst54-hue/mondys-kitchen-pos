"use client";

import { Flame } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { SpiceLevel } from "./CartContext";

type Props = {
  itemName: string;
  itemPrice: number;
  onSelect: (spice: SpiceLevel) => void;
  onSkip: () => void;
  onClose: () => void;
};

export function SpiceModifierModal({
  itemName,
  itemPrice,
  onSelect,
  onSkip,
  onClose,
}: Props) {
  const options: { level: SpiceLevel; pepperCount: 1 | 2 | 3 }[] = [
    { level: "Mild", pepperCount: 1 },
    { level: "Medium", pepperCount: 2 },
    { level: "Hot", pepperCount: 3 },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-mondy-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spice-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
            Spice Level
          </p>
          <h3
            id="spice-modal-title"
            className="mt-1 font-display text-2xl font-bold leading-tight text-mondy-ink"
          >
            {itemName}
          </h3>
          <p className="mt-1 font-sans text-sm text-mondy-muted tabular">
            {formatMoney(itemPrice)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {options.map(({ level, pepperCount }) => (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              className="group flex flex-col items-center justify-center rounded-2xl bg-mondy-cream py-5 ring-1 ring-mondy-border transition-all duration-200 ease-mondy hover:-translate-y-0.5 hover:bg-white hover:shadow-md hover:ring-mondy-red/40 active:scale-[0.97]"
            >
              <span className="flex h-10 items-center justify-center gap-0.5 text-mondy-red">
                {Array.from({ length: pepperCount }).map((_, i) => (
                  <Flame
                    key={i}
                    className="h-5 w-5 transition-transform group-hover:scale-110"
                    fill="currentColor"
                  />
                ))}
              </span>
              <span className="mt-2 font-display text-base font-semibold text-mondy-ink">
                {level}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink transition hover:bg-mondy-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 rounded-xl bg-mondy-yellow-soft px-4 py-3 font-sans text-sm font-medium text-mondy-ink ring-1 ring-mondy-yellow-deep/40 transition hover:bg-mondy-yellow"
          >
            No spice preference
          </button>
        </div>
      </div>
    </div>
  );
}
