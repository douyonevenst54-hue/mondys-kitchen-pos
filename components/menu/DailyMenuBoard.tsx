"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Ban, Check, Eye, EyeOff, Monitor, Search, Smartphone } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { WEEK, servedOn, withDay } from "@/lib/menu-visibility";
import {
  copyDaySchedule,
  setCategoryServedOn,
  setCategoryVisibility,
  setItemServedOn,
  setItemVisibility,
  setSoldOutDisplay,
} from "@/app/api/menu/actions";

type Channel = "register" | "online";

type Item = {
  id: string;
  name: string;
  price: number;
  soldOut: boolean;
  showOnRegister: boolean;
  showOnline: boolean;
  serveDays: number;
};
type Category = { id: string; name: string; items: Item[] };
type Flags = Pick<Item, "showOnRegister" | "showOnline" | "serveDays">;

type Props = {
  today: number;
  hideSoldOut: { register: boolean; online: boolean };
  categories: Category[];
};

const dayName = (d: number) => WEEK.find((w) => w.day === d)!.long;
const field = (c: Channel): "showOnRegister" | "showOnline" =>
  c === "register" ? "showOnRegister" : "showOnline";

export function DailyMenuBoard({ today, hideSoldOut: initialHide, categories }: Props) {
  const [flags, setFlags] = useState<Record<string, Flags>>(() =>
    Object.fromEntries(
      categories.flatMap((c) =>
        c.items.map((i) => [i.id, { showOnRegister: i.showOnRegister, showOnline: i.showOnline, serveDays: i.serveDays }]),
      ),
    ),
  );
  const [hideSoldOut, setHideSoldOut] = useState(initialHide);
  const [view, setView] = useState<"today" | "week">("today");
  const [day, setDay] = useState(today);
  const [copyTo, setCopyTo] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  /** Apply a change on screen right away; put it back if the save fails. */
  function save(
    change: (f: Record<string, Flags>) => Record<string, Flags>,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done?: string,
  ) {
    const before = flags;
    setFlags(change(flags));
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let message: string | null = null;
      try {
        const res = await action();
        if (!res.ok) message = res.error;
      } catch {
        message = "Couldn't reach the server. Check the connection and try again.";
      }
      if (message) {
        setFlags(before);
        setError(message);
      } else if (done) {
        setNotice(done);
      }
    });
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, query]);

  const all = categories.flatMap((c) => c.items);
  const listedToday = (i: Item, ch: Channel) => {
    const f = flags[i.id];
    return f[field(ch)] && servedOn(f.serveDays, today) && !(i.soldOut && hideSoldOut[ch]);
  };
  const registerCount = all.filter((i) => listedToday(i, "register")).length;
  const onlineCount = all.filter((i) => listedToday(i, "online")).length;
  const servedOnDay = all.filter((i) => servedOn(flags[i.id].serveDays, day)).length;

  // ── Today view actions ──
  function toggleItem(item: Item, ch: Channel) {
    const next = !flags[item.id][field(ch)];
    save(
      (f) => ({ ...f, [item.id]: { ...f[item.id], [field(ch)]: next } }),
      () => setItemVisibility(item.id, ch, next),
    );
  }

  function toggleCategory(cat: Category, ch: Channel) {
    const allShown = cat.items.every((i) => flags[i.id][field(ch)]);
    const next = !allShown;
    save(
      (f) => {
        const copy = { ...f };
        for (const i of cat.items) copy[i.id] = { ...copy[i.id], [field(ch)]: next };
        return copy;
      },
      () => setCategoryVisibility(cat.id, ch, next),
    );
  }

  // ── Week view actions ──
  function toggleServed(item: Item) {
    const next = !servedOn(flags[item.id].serveDays, day);
    save(
      (f) => ({ ...f, [item.id]: { ...f[item.id], serveDays: withDay(f[item.id].serveDays, day, next) } }),
      () => setItemServedOn(item.id, day, next),
    );
  }

  function setCategoryDay(cat: Category, served: boolean) {
    save(
      (f) => {
        const copy = { ...f };
        for (const i of cat.items) copy[i.id] = { ...copy[i.id], serveDays: withDay(copy[i.id].serveDays, day, served) };
        return copy;
      },
      () => setCategoryServedOn(cat.id, day, served),
    );
  }

  function copyDay() {
    if (copyTo === "" || copyTo === day) return;
    const to = copyTo;
    save(
      (f) => {
        const copy = { ...f };
        for (const id of Object.keys(copy)) {
          copy[id] = { ...copy[id], serveDays: withDay(copy[id].serveDays, to, servedOn(copy[id].serveDays, day)) };
        }
        return copy;
      },
      () => copyDaySchedule(day, to),
      `${dayName(to)} now has the same dishes as ${dayName(day)}.`,
    );
    setCopyTo("");
  }

  function changeSoldOut(ch: Channel, hide: boolean) {
    const before = hideSoldOut;
    setHideSoldOut({ ...hideSoldOut, [ch]: hide });
    setError(null);
    startTransition(async () => {
      try {
        const res = await setSoldOutDisplay(ch, hide);
        if (!res.ok) {
          setHideSoldOut(before);
          setError(res.error);
        }
      } catch {
        setHideSoldOut(before);
        setError("Couldn't reach the server. Check the connection and try again.");
      }
    });
  }

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
              href="/menu/availability"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Sold-out list
            </Link>
          </div>

          <div>
            <h1 className="font-display text-2xl font-black">Daily menu</h1>
            <p className="mt-0.5 text-sm text-mondy-muted" aria-live="polite">
              Today is {dayName(today)}: {registerCount} dishes on the register, {onlineCount} online.
            </p>
          </div>

          <div role="tablist" aria-label="View" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
            {(
              [
                ["today", "Show or hide"],
                ["week", "Weekly schedule"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${ring} ${
                  view === value ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "week" && (
            <div role="group" aria-label="Day" className="grid grid-cols-7 gap-1">
              {WEEK.map((w) => (
                <button
                  key={w.day}
                  type="button"
                  aria-pressed={day === w.day}
                  onClick={() => setDay(w.day)}
                  className={`relative rounded-lg py-2 text-sm font-semibold transition ${ring} ${
                    day === w.day ? "bg-mondy-ink text-white" : "bg-white ring-1 ring-mondy-border hover:bg-mondy-cream"
                  }`}
                >
                  {w.short}
                  {w.day === today && (
                    <span
                      aria-label="today"
                      className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                        day === w.day ? "bg-mondy-yellow" : "bg-mondy-red"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a dish"
              aria-label="Find a dish"
              className="h-10 w-full rounded-xl bg-mondy-cream pl-9 pr-3 text-sm placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-mondy-red/10 px-3 py-2 text-sm text-mondy-red-dark">
              {error}
            </p>
          )}
          {notice && !error && (
            <p aria-live="polite" className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-mondy-border">
              {notice}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        {view === "today" ? (
          <p className="text-sm text-mondy-muted">
            <Monitor className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Register{" "}
            <Smartphone className="ml-2 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Online menu. Hidden dishes stay
            hidden until you turn them back on. Dishes off today&apos;s schedule are dimmed; change
            that in Weekly schedule.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-mondy-muted">
              Set this once. Each day, the register and the online menu show that day&apos;s dishes on their own. {dayName(day)} has {servedOnDay} of {all.length} dishes.
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-mondy-border">
              <label htmlFor="copy-to" className="text-sm">
                Copy {dayName(day)}&apos;s dishes to
              </label>
              <select
                id="copy-to"
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value === "" ? "" : Number(e.target.value))}
                className={`h-9 rounded-lg bg-mondy-cream px-2 text-sm ring-1 ring-mondy-border ${ring}`}
              >
                <option value="">choose a day</option>
                {WEEK.filter((w) => w.day !== day).map((w) => (
                  <option key={w.day} value={w.day}>
                    {w.long}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={copyDay}
                disabled={copyTo === "" || busy}
                className={`h-9 rounded-lg bg-mondy-ink px-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-40 ${ring}`}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {visible.length === 0 && (
          <p className="py-16 text-center text-sm text-mondy-muted">No dishes match that search.</p>
        )}

        {visible.map((cat) => (
          <section key={cat.id} className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-mondy-red-dark">{cat.name}</h2>
              {view === "today" ? (
                <div className="flex gap-1.5">
                  {(["register", "online"] as const).map((ch) => {
                    const shown = cat.items.filter((i) => flags[i.id][field(ch)]).length;
                    const allShown = shown === cat.items.length;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleCategory(cat, ch)}
                        title={allShown ? `Hide all ${cat.name} on the ${ch === "register" ? "register" : "online menu"}` : `Show all ${cat.name}`}
                        className={`rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
                      >
                        {allShown ? "Hide all" : "Show all"} {ch === "register" ? "on register" : "online"}
                        <span className="ml-1 font-normal text-mondy-muted tabular">
                          {shown}/{cat.items.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategoryDay(cat, true)}
                    className={`rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
                  >
                    All on {WEEK.find((w) => w.day === day)!.short}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryDay(cat, false)}
                    className={`rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
                  >
                    None
                  </button>
                </div>
              )}
            </div>

            <ul className="divide-y divide-mondy-border overflow-hidden rounded-xl bg-white ring-1 ring-mondy-border">
              {cat.items.map((item) => {
                const f = flags[item.id];
                if (view === "week") {
                  const on = servedOn(f.serveDays, day);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleServed(item)}
                        className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-mondy-cream ${ring} focus-visible:ring-inset`}
                      >
                        <span
                          aria-hidden
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ${
                            on ? "bg-mondy-red text-white ring-mondy-red" : "bg-white ring-mondy-border"
                          }`}
                        >
                          {on && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[15px] font-medium ${on ? "" : "text-mondy-muted"}`}>
                            {item.name}
                          </span>
                          <span className="text-xs text-mondy-muted">{formatMoney(item.price)}</span>
                        </span>
                        <span aria-label="Days served" className="flex shrink-0 gap-0.5">
                          {WEEK.map((w) => (
                            <span
                              key={w.day}
                              title={w.long}
                              className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
                                servedOn(f.serveDays, w.day)
                                  ? w.day === day
                                    ? "bg-mondy-red text-white"
                                    : "bg-mondy-ink/80 text-white"
                                  : "bg-mondy-cream text-mondy-muted/60"
                              }`}
                            >
                              {w.letter}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                }

                const offToday = !servedOn(f.serveDays, today);
                const status = offToday
                  ? `Not on ${dayName(today)}'s schedule`
                  : item.soldOut
                    ? "Sold out"
                    : !f.showOnRegister && !f.showOnline
                      ? "Hidden everywhere"
                      : null;
                return (
                  <li key={item.id} className="flex min-h-14 items-center gap-2 px-4 py-3 sm:gap-3">
                    <span className={`min-w-0 flex-1 ${offToday ? "opacity-50" : ""}`}>
                      <span className="line-clamp-2 block text-[15px] font-medium leading-snug">{item.name}</span>
                      <span className="text-xs text-mondy-muted">
                        {formatMoney(item.price)}
                        {status && <span className={item.soldOut && !offToday ? "text-mondy-red-dark" : ""}> · {status}</span>}
                      </span>
                    </span>
                    {(["register", "online"] as const).map((ch) => {
                      const shown = f[field(ch)];
                      const Icon = ch === "register" ? Monitor : Smartphone;
                      const where = ch === "register" ? "register" : "online menu";
                      return (
                        <button
                          key={ch}
                          type="button"
                          aria-pressed={shown}
                          aria-label={`${item.name} on the ${where}: ${shown ? "shown" : "hidden"}. Tap to ${shown ? "hide" : "show"}.`}
                          onClick={() => toggleItem(item, ch)}
                          className={`flex h-9 w-[3.75rem] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold transition sm:w-28 ${ring} ${
                            shown
                              ? "bg-white ring-1 ring-mondy-border hover:bg-mondy-cream"
                              : "bg-mondy-ink text-white hover:bg-black"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {shown ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                          <span className="hidden sm:inline">{ch === "register" ? "Register" : "Online"}</span>
                        </button>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="mt-10 rounded-xl bg-white p-4 ring-1 ring-mondy-border">
          <h2 className="font-display text-lg font-bold">When a dish sells out</h2>
          <p className="mt-0.5 text-sm text-mondy-muted">Sold-out dishes can never be ordered. Choose whether people still see them.</p>
          {(
            [
              ["register", "On the register", "Show greyed out"],
              ["online", "On the online menu", "Show as sold out"],
            ] as const
          ).map(([ch, label, showLabel]) => (
            <div key={ch} className="mt-4">
              <p className="text-sm font-medium">{label}</p>
              <div role="radiogroup" aria-label={label} className="mt-1.5 flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
                {(
                  [
                    [false, showLabel],
                    [true, "Hide it"],
                  ] as const
                ).map(([hide, text]) => (
                  <button
                    key={text}
                    type="button"
                    role="radio"
                    aria-checked={hideSoldOut[ch] === hide}
                    onClick={() => changeSoldOut(ch, hide)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${ring} ${
                      hideSoldOut[ch] === hide ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
