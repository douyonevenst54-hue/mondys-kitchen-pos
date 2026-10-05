"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ClipboardList, Search } from "lucide-react";
import { changePortions } from "@/app/api/portions/actions";

type Item = { id: string; name: string; portionsLeft: number | null };
type Category = { id: string; name: string; items: Item[] };
type Mode = "count" | "add" | "remove";

const REASONS = ["Waste", "Staff meal", "Correction"];

export function PortionsBoard({ categories }: { categories: Category[] }) {
  const [left, setLeft] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      categories.flatMap((c) => c.items.map((i) => [i.id, i.portionsLeft])),
    ),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [countedOnly, setCountedOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const countedTotal = Object.values(left).filter((v) => v !== null).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            (!countedOnly || left[i.id] !== null) &&
            (!q || i.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, left, query, countedOnly]);

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
            <Link
              href="/reports/portions"
              className="flex items-center gap-1.5 rounded-lg bg-mondy-red px-3 py-2 font-sans text-xs font-semibold text-white transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50"
            >
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              Day log
            </Link>
          </div>

          <div>
            <h1 className="font-display text-2xl font-black text-mondy-ink">
              Portion counts
            </h1>
            <p className="mt-0.5 font-sans text-sm text-mondy-muted">
              Count each dish when service starts. Sales subtract on their own,
              and a dish sells out at zero.
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
                placeholder="Find a dish"
                aria-label="Find a dish"
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
                  [false, "All dishes"],
                  [true, `Counted (${countedTotal})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={countedOnly === value}
                  onClick={() => setCountedOnly(value)}
                  className={`flex-1 rounded-lg px-3 py-2 font-sans text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 ${
                    countedOnly === value
                      ? "bg-white text-mondy-ink shadow-sm"
                      : "text-mondy-muted hover:text-mondy-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <p
              aria-live="polite"
              className="rounded-lg bg-white px-3 py-2 font-sans text-sm text-mondy-ink ring-1 ring-mondy-border"
            >
              {notice}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        {visible.length === 0 ? (
          <p className="py-16 text-center font-sans text-sm text-mondy-muted">
            {countedOnly && !query
              ? "No dishes are being counted yet. Open a dish and enter a count to start."
              : "No dishes match that search."}
          </p>
        ) : (
          visible.map((category) => (
            <section key={category.id} className="mt-6 first:mt-2">
              <h2 className="mb-2 font-display text-lg font-bold text-mondy-red-dark">
                {category.name}
              </h2>
              <ul className="divide-y divide-mondy-border overflow-hidden rounded-xl bg-white ring-1 ring-mondy-border">
                {category.items.map((item) => (
                  <PortionRow
                    key={item.id}
                    item={item}
                    portionsLeft={left[item.id]}
                    open={openId === item.id}
                    onToggle={() =>
                      setOpenId((id) => (id === item.id ? null : item.id))
                    }
                    onSaved={(value, message) => {
                      setLeft((l) => ({ ...l, [item.id]: value }));
                      setNotice(message);
                      setOpenId(null);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function PortionRow({
  item,
  portionsLeft,
  open,
  onToggle,
  onSaved,
}: {
  item: Item;
  portionsLeft: number | null;
  open: boolean;
  onToggle: () => void;
  onSaved: (value: number, message: string) => void;
}) {
  const counted = portionsLeft !== null;
  const [mode, setMode] = useState<Mode>("count");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Number.parseInt(qty, 10);
  const valid =
    Number.isInteger(n) &&
    n >= (mode === "count" ? 0 : 1) &&
    (mode !== "remove" || reason.trim().length >= 3);

  const saveLabel =
    mode === "count"
      ? "Save count"
      : mode === "add"
        ? `Add ${Number.isInteger(n) && n > 0 ? n : ""}`.trim()
        : `Remove ${Number.isInteger(n) && n > 0 ? n : ""}`.trim();

  function save() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await changePortions(
          mode === "remove"
            ? { kind: "remove", itemId: item.id, quantity: n, reason: reason.trim() }
            : { kind: mode, itemId: item.id, quantity: n },
        );
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setQty("");
        setReason("");
        setMode("count");
        onSaved(
          res.portionsLeft,
          `${item.name}: ${res.portionsLeft} left${
            res.portionsLeft === 0 ? " (marked sold out)" : ""
          }`,
        );
      } catch {
        setError("Couldn't reach the server. Check the connection and try again.");
      }
    });
  }

  const modes: [Mode, string][] = counted
    ? [
        ["count", "Count"],
        ["add", "Add batch"],
        ["remove", "Remove"],
      ]
    : [["count", "Start counting"]];

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-mondy-cream focus:outline-none focus-visible:bg-mondy-cream focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mondy-red/50"
      >
        <span className="min-w-0 flex-1 truncate font-sans text-[15px] font-medium text-mondy-ink">
          {item.name}
        </span>
        {counted ? (
          <span
            className={`min-w-16 text-right font-display text-2xl font-black tabular ${
              portionsLeft === 0
                ? "text-mondy-muted"
                : portionsLeft! <= 3
                  ? "text-mondy-red"
                  : "text-mondy-ink"
            }`}
          >
            {portionsLeft}
            <span className="ml-1 font-sans text-xs font-medium text-mondy-muted">
              left
            </span>
          </span>
        ) : (
          <span className="font-sans text-xs text-mondy-muted">Not counted</span>
        )}
      </button>

      {open && (
        <div className="border-t border-mondy-border bg-mondy-cream/60 px-4 py-4">
          {modes.length > 1 && (
            <div
              role="group"
              aria-label="Change type"
              className="mb-3 flex rounded-xl bg-white p-1 ring-1 ring-mondy-border"
            >
              {modes.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg px-2 py-2 font-sans text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 ${
                    mode === value
                      ? "bg-mondy-ink text-white"
                      : "text-mondy-muted hover:text-mondy-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <label className="block font-sans text-sm text-mondy-ink">
            {mode === "count"
              ? "How many portions are ready right now?"
              : mode === "add"
                ? "How many portions did the new batch make?"
                : "How many portions to take off?"}
            <input
              type="number"
              inputMode="numeric"
              min={mode === "count" ? 0 : 1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
              className="mt-1.5 h-12 w-full rounded-xl bg-white px-3 font-display text-xl font-bold tabular text-mondy-ink ring-1 ring-mondy-border focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
          </label>

          {mode === "count" && counted && (
            <p className="mt-1.5 font-sans text-xs text-mondy-muted">
              The system expects {portionsLeft}. Any difference goes in the day log.
            </p>
          )}

          {mode === "remove" && (
            <div className="mt-3">
              <p className="font-sans text-sm text-mondy-ink">Reason</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={reason === r}
                    onClick={() => setReason(r)}
                    className={`rounded-full px-3 py-1.5 font-sans text-xs font-semibold ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 ${
                      reason === r
                        ? "bg-mondy-ink text-white ring-mondy-ink"
                        : "bg-white text-mondy-ink ring-mondy-border hover:bg-mondy-cream"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Or type a reason"
                maxLength={120}
                aria-label="Reason"
                className="mt-2 h-10 w-full rounded-xl bg-white px-3 font-sans text-sm text-mondy-ink ring-1 ring-mondy-border placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-mondy-red/10 px-3 py-2 font-sans text-sm text-mondy-red-dark"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!valid || pending}
              className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-sans text-sm font-semibold text-white transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : saveLabel}
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-xl bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
