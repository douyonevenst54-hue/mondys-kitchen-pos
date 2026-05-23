"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

type Props = {
  hasOpenShift: boolean;
  startedAt: Date | string | null;
};

export function ShiftStatus({ hasOpenShift, startedAt }: Props) {
  if (!hasOpenShift) {
    return (
      <Link
        href="/shift/open"
        className="hidden items-center gap-1.5 rounded-lg bg-mondy-yellow-soft px-2.5 py-1.5 font-sans text-[11px] font-semibold text-mondy-red-dark ring-1 ring-mondy-yellow-deep/30 transition hover:bg-mondy-yellow sm:flex"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-mondy-red-dark"
        />
        Open shift
      </Link>
    );
  }

  const startedText = startedAt ? formatTime(startedAt) : "";

  return (
    <Link
      href="/shift/close"
      className="hidden items-center gap-1.5 rounded-lg bg-mondy-cream px-2.5 py-1.5 font-sans text-[11px] font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-white sm:flex"
      title="Close shift"
    >
      <span
        aria-hidden
        className="relative flex h-1.5 w-1.5"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      <Clock className="h-3 w-3 text-mondy-muted" />
      <span className="tabular">{startedText}</span>
    </Link>
  );
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
