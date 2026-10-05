"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Ban, Check, Search } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { setItemAvailability } from "@/app/api/menu/actions";

type Item = { id: string; name: string; price: number; isAvailable: boolean };
type Category = { id: string; name: string; items: Item[] };

type Props = { categories: Category[] };

type Filter = "all" | "soldOut";

export function AvailabilityBoard({ categories }: Props) {
  // Local copy of availability so taps feel instant; reverted if the save fails.
  const [availability, setAvailability] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        categories.flatMap((c) => c.items.map((i) => [i.id, i.isAvailable])),
      ),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [, startTransition] = useTransition();

  const totalItems = Object.keys(availability).length;
  const soldOutCount = Object.values(availability).filter((v) => !v).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          if (filter === "soldOut" && availability[i.id]) return false;
          if (q && !i.name.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, availability, query, filter]);

  function toggle(item: Item) {
    if (pendingIds.has(item.id)) return;
    const next = !availability[item.id];

    setError(null);
    setAvailability((a) => ({ ...a, [item.id]: next }));
    setPendingIds((p) => new Set(p).add(item.id));

    startTransition(async () => {
      let failed: string | null = null;
      try {
        const res = await setItemAvailability(item.id, next);
        if (!res.ok) failed = res.error;
      } catch {
        failed = "Couldn't reach the server. Check the connection and try again.";
      }
      if (failed) {
        setAvailability((a) => ({ ...a, [item.id]: !next }));
        setError(`${item.name}: ${failed}`);
      }
      setPendingIds((p) => {
        const copy = new Set(p);
        copy.delete(item.id);
        return copy;
      });
    });
  }

  return (
    <main className="min-h-screen bg-mondy-cream">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to register
            </Link>
            <p className="font-sans text-sm text-mondy-muted" aria-live="polite">
              {soldOutCount === 0
                ? "Everything is available"
                : `${soldOutCount} of ${totalItems} sold out`}
            </p>
          </div>

          <div>
            <h1 className="font-display text-2xl font-black text-mondy-ink">
              Sold-out list
            </h1>
            <p className="mt-0.5 font-sans text-sm text-mondy-muted">
              Tap an item to take it off the register. Tap again when it&apos;s
              back.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an item"
                aria-label="Find an item"
                className="h-11 w-full rounded-xl bg-mondy-cream pl-9 pr-3 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              />
            </div>
            <div
              role="group"
              aria-label="Show"
              className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border"
            >
              {(
                [
                  ["all", "All items"],
                  ["soldOut", `Sold out (${soldOutCount})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`flex-1 rounded-lg px-3 py-2 font-sans text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 ${
                    filter === value
                      ? "bg-white text-mondy-ink shadow-sm"
                      : "text-mondy-muted hover:text-mondy-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-mondy-red/10 px-3 py-2 font-sans text-sm text-mondy-red-dark"
            >
              {error}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        {visible.length === 0 ? (
          <p className="py-16 text-center font-sans text-sm text-mondy-muted">
            {filter === "soldOut" && !query
              ? "Nothing is sold out right now."
              : "No items match that search."}
          </p>
        ) : (
          visible.map((category) => (
            <section key={category.id} className="mt-6 first:mt-2">
              <h2 className="mb-2 font-display text-lg font-bold text-mondy-red-dark">
                {category.name}
              </h2>
              <ul className="divide-y divide-mondy-border overflow-hidden rounded-xl bg-white ring-1 ring-mondy-border">
                {category.items.map((item) => {
                  const available = availability[item.id];
                  const pending = pendingIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item)}
                        disabled={pending}
                        aria-pressed={!available}
                        aria-label={`${item.name}, ${
                          available ? "available" : "sold out"
                        }. Tap to mark ${available ? "sold out" : "available"}.`}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-mondy-cream focus:outline-none focus-visible:bg-mondy-cream focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mondy-red/50 disabled:cursor-wait"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate font-sans text-[15px] font-medium ${
                              available
                                ? "text-mondy-ink"
                                : "text-mondy-muted line-through decoration-mondy-red/60"
                            }`}
                          >
                            {item.name}
                          </span>
                          <span className="font-sans text-xs text-mondy-muted">
                            {formatMoney(item.price)}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`flex w-28 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-semibold transition ${
                            available
                              ? "bg-white text-mondy-ink ring-1 ring-mondy-border"
                              : "bg-mondy-red text-white"
                          } ${pending ? "opacity-60" : ""}`}
                        >
                          {available ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Available
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5" />
                              Sold out
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
