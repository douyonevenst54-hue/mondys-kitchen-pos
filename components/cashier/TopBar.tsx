"use client";

import Image from "next/image";
import { Search, LogOut, User, Clock, Receipt } from "lucide-react";
import { useState } from "react";
import { ShiftStatus } from "./ShiftStatus";

type Props = {
  staffName: string;
  staffRole: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  signOutAction: () => Promise<void>;
  logoUrl: string | null;
  hasOpenShift: boolean;
  shiftStartedAt: Date | string | null;
};

export function TopBar({
  staffName,
  staffRole,
  searchValue,
  onSearchChange,
  signOutAction,
  logoUrl,
  hasOpenShift,
  shiftStartedAt,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-mondy-border bg-white px-3 sm:gap-4 sm:px-5">
      {/* Wordmark */}
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt="Mondy's Kitchen"
            width={36}
            height={36}
            priority
            className="h-9 w-9 object-contain"
          />
        ) : (
          <div
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-mondy-yellow shadow-inner ring-1 ring-mondy-yellow-deep/30"
          >
            <span className="font-display text-lg font-black leading-none text-mondy-red">
              M
            </span>
          </div>
        )}
        <div className="hidden flex-col leading-none sm:flex">
          <span className="font-display text-base font-black text-mondy-red">
            MONDY&apos;S
          </span>
          <span className="font-sans text-[10px] font-semibold tracking-[0.2em] text-mondy-muted">
            KITCHEN
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative ml-1 flex-1 sm:ml-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted"
          aria-hidden
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search menu…"
          className="h-10 w-full rounded-xl bg-mondy-cream pl-9 pr-3 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
        />
      </div>

      {/* Shift status chip */}
      <ShiftStatus
        hasOpenShift={hasOpenShift}
        startedAt={shiftStartedAt}
      />

      {/* Staff badge + menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-mondy-cream px-2.5 py-1.5 ring-1 ring-mondy-border transition hover:bg-white sm:px-3 sm:py-2"
        >
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-lg bg-mondy-red text-white"
          >
            <User className="h-4 w-4" />
          </span>
          <span className="hidden text-left leading-tight sm:flex sm:flex-col">
            <span className="font-display text-sm font-semibold text-mondy-ink">
              {staffName}
            </span>
            <span className="font-sans text-[10px] uppercase tracking-wider text-mondy-muted">
              {staffRole}
            </span>
          </span>
        </button>

        {menuOpen && (
          <>
            {/* Click-away layer */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-mondy-border">
              <div className="border-b border-mondy-border px-4 py-3 sm:hidden">
                <p className="font-display text-sm font-semibold text-mondy-ink">
                  {staffName}
                </p>
                <p className="font-sans text-[10px] uppercase tracking-wider text-mondy-muted">
                  {staffRole}
                </p>
              </div>
              {hasOpenShift && (
                <a
                  href="/shift/close"
                  className="flex w-full items-center gap-3 border-b border-mondy-border px-4 py-3 text-left font-sans text-sm text-mondy-ink transition hover:bg-mondy-cream"
                >
                  <Clock className="h-4 w-4 text-mondy-muted" aria-hidden />
                  Close shift
                </a>
              )}
              {!hasOpenShift && (
                <a
                  href="/shift/open"
                  className="flex w-full items-center gap-3 border-b border-mondy-border px-4 py-3 text-left font-sans text-sm text-mondy-ink transition hover:bg-mondy-cream"
                >
                  <Clock className="h-4 w-4 text-mondy-muted" aria-hidden />
                  Open shift
                </a>
              )}
              <a
                href="/orders"
                className="flex w-full items-center gap-3 border-b border-mondy-border px-4 py-3 text-left font-sans text-sm text-mondy-ink transition hover:bg-mondy-cream"
              >
                <Receipt className="h-4 w-4 text-mondy-muted" aria-hidden />
                Orders
              </a>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left font-sans text-sm text-mondy-ink transition hover:bg-mondy-cream"
                >
                  <LogOut className="h-4 w-4 text-mondy-muted" aria-hidden />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}