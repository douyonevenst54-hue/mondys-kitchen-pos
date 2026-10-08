"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarDays, Check, Search } from "lucide-react";
import { setItemPrice, setOptionPrice } from "@/app/api/menu/actions";

type Dish = { id: string; name: string; number: number | null; price: number; hidden: boolean };
type Category = { id: string; name: string; items: Dish[] };
type Choice = { id: string; name: string; price: number };
type Group = { id: string; name: string; usedBy: string[]; options: Choice[] };

type Filter = "needs" | "menu" | "hidden";

export function PriceEditor({ categories, groups }: { categories: Category[]; groups: Group[] }) {
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(categories.flatMap((c) => c.items.map((i) => [i.id, i.price]))),
  );
  const all = categories.flatMap((c) => c.items);
  const needsCount = all.filter((i) => !i.hidden && !(prices[i.id] > 0)).length;

  const [tab, setTab] = useState<"dishes" | "choices">("dishes");
  const [filter, setFilter] = useState<Filter>(needsCount > 0 ? "needs" : "menu");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          if (q && !i.name.toLowerCase().includes(q)) return false;
          if (filter === "hidden") return i.hidden;
          if (i.hidden) return false;
          return filter === "needs" ? !(prices[i.id] > 0) : true;
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, filter, query, prices]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.usedBy.some((n) => n.toLowerCase().includes(q)) ||
        g.options.some((o) => o.name.toLowerCase().includes(q)),
    );
  }, [groups, query]);

  const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";

  return (
    <main className="min-h-screen bg-mondy-cream font-sans text-mondy-ink">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to register
            </Link>
            <Link
              href="/menu/daily"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Daily menu
            </Link>
          </div>

          <div>
            <h1 className="font-display text-2xl font-black">Prices</h1>
            <p className="mt-0.5 text-sm text-mondy-muted" aria-live="polite">
              {needsCount > 0
                ? `${needsCount} ${needsCount === 1 ? "dish needs" : "dishes need"} a price. They stay off the register and online menu until priced.`
                : "Every dish on the menu has a price."}
            </p>
          </div>

          <div role="tablist" aria-label="What to price" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
            {(
              [
                ["dishes", "Dishes"],
                ["choices", "Choices & extras"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${ring} ${
                  tab === value ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "dishes" ? "Find a dish" : "Find a choice"}
                aria-label="Search"
                className="h-10 w-full rounded-xl bg-mondy-cream pl-9 pr-3 text-sm placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              />
            </div>
            {tab === "dishes" && (
              <div role="group" aria-label="Show" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
                {(
                  [
                    ["needs", `Needs a price (${needsCount})`],
                    ["menu", "On the menu"],
                    ["hidden", "Hidden"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${ring} ${
                      filter === value ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-2 sm:px-6">
        {tab === "dishes" ? (
          <>
            {visible.length === 0 && (
              <p className="py-16 text-center text-sm text-mondy-muted">
                {filter === "needs" && !query ? "Nothing left to price." : "No dishes match."}
              </p>
            )}
            {visible.map((c) => (
              <section key={c.id} className="mt-6">
                <h2 className="mb-2 border-b border-mondy-red pb-1.5 font-display text-base font-black uppercase tracking-wide text-mondy-red">
                  {c.name}
                </h2>
                <ul className="divide-y divide-mondy-border overflow-hidden rounded-xl bg-white ring-1 ring-mondy-border">
                  {c.items.map((i) => (
                    <PriceRow
                      key={i.id}
                      label={i.number != null ? `${i.number}. ${i.name}` : i.name}
                      value={prices[i.id]}
                      placeholder="Needs a price"
                      max={999.99}
                      onSaved={(v) => setPrices((p) => ({ ...p, [i.id]: v }))}
                      save={(v) => setItemPrice(i.id, v)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-mondy-muted">
              Choices are free unless you add an extra charge. A charge here applies to every dish that offers the choice.
            </p>
            {visibleGroups.map((g) => (
              <section key={g.id} className="mt-6">
                <h2 className="font-display text-base font-black">{g.name}</h2>
                <p className="mb-2 text-xs text-mondy-muted">Used by {g.usedBy.join(", ")}</p>
                <ul className="divide-y divide-mondy-border overflow-hidden rounded-xl bg-white ring-1 ring-mondy-border">
                  {g.options.map((o) => (
                    <PriceRow
                      key={o.id}
                      label={o.name}
                      value={o.price}
                      placeholder="Free"
                      prefix="+"
                      max={99.99}
                      save={(v) => setOptionPrice(o.id, v)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function PriceRow({
  label,
  value,
  placeholder,
  prefix = "",
  max,
  save,
  onSaved,
}: {
  label: string;
  value: number;
  placeholder: string;
  prefix?: string;
  max: number;
  save: (v: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSaved?: (v: number) => void;
}) {
  const shown = (v: number) => (v > 0 ? v.toFixed(2) : "");
  const [text, setText] = useState(shown(value));
  const [saved, setSaved] = useState(shown(value));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    const clean = text.trim().replace(/^\$/, "");
    if (clean === saved) return;
    const n = clean === "" ? 0 : Number(clean);
    if (!Number.isFinite(n) || n < 0 || n > max || !/^\d*(\.\d{0,2})?$/.test(clean)) {
      setStatus("error");
      setError(`Enter an amount like 12.50 (up to $${max.toFixed(2)})`);
      return;
    }
    const rounded = Math.round(n * 100) / 100;
    startTransition(async () => {
      try {
        const res = await save(rounded);
        if (!res.ok) {
          setStatus("error");
          setError(res.error);
          return;
        }
        const s = shown(rounded);
        setText(s);
        setSaved(s);
        setStatus("saved");
        setError(null);
        onSaved?.(rounded);
      } catch {
        setStatus("error");
        setError("Couldn't save. Check the connection and try again.");
      }
    });
  }

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{label}</span>
        <label className="relative flex items-center">
          <span className="sr-only">Price for {label}</span>
          <span aria-hidden className="pointer-events-none absolute left-3 text-sm text-mondy-muted">
            {prefix}$
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setStatus("idle");
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-invalid={status === "error"}
            className={`h-11 w-32 rounded-xl bg-mondy-cream pr-3 text-right text-base tabular ring-1 placeholder:text-sm placeholder:text-mondy-red-dark/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50 ${
              prefix ? "pl-7" : "pl-6"
            } ${status === "error" ? "ring-2 ring-mondy-red" : "ring-mondy-border"}`}
          />
        </label>
        <span className="grid w-5 place-items-center" aria-live="polite">
          {pending ? (
            <span className="h-3 w-3 animate-pulse rounded-full bg-mondy-muted" aria-label="Saving" />
          ) : status === "saved" ? (
            <Check className="h-4 w-4 text-mondy-red" aria-label="Saved" />
          ) : null}
        </span>
      </div>
      {status === "error" && error && (
        <p role="alert" className="mt-1 text-right text-xs text-mondy-red-dark">
          {error}
        </p>
      )}
    </li>
  );
}
