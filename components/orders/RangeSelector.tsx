"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Range = "today" | "yesterday" | "last7";

const OPTIONS: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
];

export function RangeSelector({ current }: { current: Range }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(range: Range) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    router.push(`/orders?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={`rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition ${
              active
                ? "bg-white text-mondy-red shadow-sm ring-1 ring-mondy-border"
                : "text-mondy-muted hover:text-mondy-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}