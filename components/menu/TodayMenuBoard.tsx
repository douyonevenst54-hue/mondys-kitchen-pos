"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Camera, ChevronDown, Pencil, Plus, RotateCcw, Search, Undo2, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { setItemPrice } from "@/app/api/menu/actions";
import { clearToday, setOnToday, type TodayResult } from "@/app/menu/today/actions";
import type { TodaySection, TodayDish } from "@/lib/today-menu";
import { DishEditor, type EditorStart } from "@/components/menu/DishEditor";

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";
const smallBtn = `flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream disabled:opacity-50 ${ring}`;

/** "Sides: Pasta Salad or Beet Salad · Protein: Chicken or Griot" */
function choicesText(d: TodayDish): string {
  return d.groups
    .map((g) => `${g.name}: ${g.options.map((o) => o.name).join(g.max === 1 ? " or " : ", ")}`)
    .join(" · ");
}

export function TodayMenuBoard({ sections, dayName }: { sections: TodaySection[]; dayName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditingState] = useState<EditorStart | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const setEditing = (e: EditorStart | null) => {
    setEditorKey((k) => k + 1);
    setEditingState(e);
  };
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = sections.map((s) => ({ ...s, dishes: s.dishes.filter((d) => d.onToday) })).filter((s) => s.dishes.length);
  const todayCount = today.reduce((n, s) => n + s.dishes.length, 0);
  const unpriced = today.reduce((n, s) => n + s.dishes.filter((d) => d.needsPrice).length, 0);

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        dishes: s.dishes.filter(
          (d) => !d.onToday && (!q || d.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || String(d.number ?? "") === q),
        ),
      }))
      .filter((s) => s.dishes.length);
  }, [sections, query]);
  const libraryCount = sections.reduce((n, s) => n + s.dishes.filter((d) => !d.onToday).length, 0);

  function run(id: string | null, action: () => Promise<TodayResult>, done: string) {
    setError(null);
    setNotice(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) setError(res.error);
        else {
          setNotice(done);
          router.refresh();
        }
      } catch {
        setError("Couldn't save. Check the connection and try again.");
      } finally {
        setBusyId(null);
      }
    });
  }

  const sectionList = sections.map((s) => ({ id: s.id, name: s.name }));

  return (
    <main className="min-h-screen bg-mondy-cream font-sans text-mondy-ink">
      <header className="sticky top-0 z-20 border-b border-mondy-border bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className={smallBtn}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to register
            </Link>
            <div className="flex gap-2">
              <Link href="/menu/photos" className={smallBtn}>
                <Camera className="h-3.5 w-3.5" aria-hidden />
                Photos
              </Link>
              <button
                type="button"
                onClick={() => setEditing({ mode: "new" })}
                className={`flex items-center gap-1.5 rounded-lg bg-mondy-red px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-mondy-red-dark ${ring}`}
              >
                <Plus className="h-4 w-4" aria-hidden />
                New dish
              </button>
            </div>
          </div>
          <div>
            <h1 className="font-display text-2xl font-black">Today&apos;s menu</h1>
            <p className="mt-0.5 text-sm text-mondy-muted">
              {dayName}. What customers and the register see right now. Every other dish waits in the library below:
              bring one back with a tap.
            </p>
          </div>
          <div aria-live="polite">
            {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">{notice}</p>}
            {error && (
              <p role="alert" className="rounded-lg bg-mondy-yellow px-3 py-2 text-sm font-medium text-mondy-red-dark">
                {error}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        {/* ── On today ─────────────────────────────────────────────── */}
        <section aria-labelledby="today-h" className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-mondy-red pb-2">
            <h2 id="today-h" className="font-display text-lg font-black uppercase tracking-wide text-mondy-red">
              On the menu today ({todayCount})
            </h2>
            {todayCount > 0 &&
              (confirmClear ? (
                <span className="flex items-center gap-2 text-xs">
                  Move every dish to the library?
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setConfirmClear(false);
                      run(null, clearToday, "Today's menu is empty. Bring dishes back from the library or add new ones.");
                    }}
                    className={`rounded-lg bg-mondy-red px-3 py-1.5 font-semibold text-white ${ring}`}
                  >
                    Yes, start fresh
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)} className={`rounded-lg px-2 py-1.5 font-semibold ring-1 ring-mondy-border ${ring}`}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmClear(true)} className={smallBtn}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Start fresh
                </button>
              ))}
          </div>
          {unpriced > 0 && (
            <p className="mt-3 rounded-xl bg-mondy-yellow px-4 py-2.5 text-sm">
              <b>{unpriced} {unpriced === 1 ? "dish needs" : "dishes need"} a price.</b> Customers and the register won&apos;t
              see {unpriced === 1 ? "it" : "them"} until you type a price.
            </p>
          )}
          {todayCount === 0 && (
            <p className="py-10 text-center text-sm text-mondy-muted">
              Nothing on today&apos;s menu. Bring dishes back from the library below, or tap <b>New dish</b>.
            </p>
          )}
          {today.map((s) => (
            <div key={s.id} className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-mondy-muted">{s.name}</h3>
              <ul className="divide-y divide-mondy-border overflow-hidden rounded-2xl bg-white ring-1 ring-mondy-border">
                {s.dishes.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-[16px] font-bold leading-snug">
                        {d.number != null && <span className="tabular">{d.number}. </span>}
                        {d.name}
                      </p>
                      {d.groups.length > 0 && <p className="mt-0.5 text-sm text-mondy-muted">{choicesText(d)}</p>}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {d.needsPrice && <Badge tone="red">Needs a price</Badge>}
                        {d.soldOut && <Badge>Sold out</Badge>}
                        {d.onlyOn && <Badge>{d.onlyOn === "register" ? "Register only" : "Online only"}</Badge>}
                      </div>
                    </div>
                    <InlinePrice key={`${d.id}-${d.price}`} dish={d} onSaved={() => router.refresh()} />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setEditing({ mode: "edit", dish: d })} className={smallBtn} aria-label={`Edit ${d.name}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending && busyId === d.id}
                        onClick={() => run(d.id, () => setOnToday(d.id, false), `${d.name} moved to the library.`)}
                        className={smallBtn}
                        aria-label={`Remove ${d.name} from today`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ── Library ──────────────────────────────────────────────── */}
        <section aria-labelledby="lib-h" className="mt-12">
          <h2 id="lib-h" className="border-b-2 border-mondy-border pb-2 font-display text-lg font-black uppercase tracking-wide text-mondy-muted">
            Dish library ({libraryCount})
          </h2>
          <p className="mt-2 text-sm text-mondy-muted">Saved dishes that aren&apos;t on today&apos;s menu. Nothing here is lost.</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a dish, section or number"
              aria-label="Search the dish library"
              className="h-11 w-full rounded-xl bg-white pl-9 pr-3 text-sm ring-1 ring-mondy-border placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
          </div>
          {library.length === 0 && (
            <p className="py-8 text-center text-sm text-mondy-muted">{query ? "No saved dish matches." : "Every dish is on today's menu."}</p>
          )}
          {library.map((s) => (
            <details key={s.id} open={Boolean(query) || undefined} className="group mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-mondy-border">
              <summary className={`flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold ${ring}`}>
                <span>
                  {s.name} <span className="font-normal text-mondy-muted">({s.dishes.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 text-mondy-muted transition group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="divide-y divide-mondy-border border-t border-mondy-border">
                {s.dishes.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {d.number != null && <span className="tabular">{d.number}. </span>}
                        {d.name}
                      </p>
                      <p className="text-xs text-mondy-muted">
                        {d.needsPrice ? "No price yet" : formatMoney(d.price)}
                        {d.groups.length > 0 && ` · ${d.groups.map((g) => g.name.toLowerCase()).join(", ")}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditing({ mode: "edit", dish: d })} className={smallBtn} aria-label={`Edit ${d.name}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={pending && busyId === d.id}
                      onClick={() => run(d.id, () => setOnToday(d.id, true), `${d.name} is back on today's menu.`)}
                      className={`flex items-center gap-1.5 rounded-lg bg-mondy-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-50 ${ring}`}
                      aria-label={`Bring back ${d.name}`}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      Bring back
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      </div>

      {editing && (
        <DishEditor
          key={editorKey}
          start={editing}
          sections={sectionList}
          onClose={() => setEditing(null)}
          onCopy={(prefill) => setEditing({ mode: "copy", prefill })}
          onSaved={(msg) => {
            setEditing(null);
            setError(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "red" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        tone === "red" ? "bg-mondy-red text-white" : "bg-mondy-cream text-mondy-muted ring-1 ring-mondy-border"
      }`}
    >
      {children}
    </span>
  );
}

function InlinePrice({ dish, onSaved }: { dish: TodayDish; onSaved: () => void }) {
  const shown = dish.price > 0 ? dish.price.toFixed(2) : "";
  const [text, setText] = useState(shown);
  const [saved, setSaved] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    const clean = text.trim().replace(/^\$/, "");
    if (clean === saved) return;
    const n = clean === "" ? 0 : Number(clean);
    if (!/^\d*(\.\d{0,2})?$/.test(clean) || !Number.isFinite(n) || n > 999.99) {
      setError("Like 12.99");
      return;
    }
    startTransition(async () => {
      const res = await setItemPrice(dish.id, Math.round(n * 100) / 100);
      if (!res.ok) return setError(res.error);
      setError(null);
      setSaved(clean === "" ? "" : n.toFixed(2));
      setText(clean === "" ? "" : n.toFixed(2));
      onSaved();
    });
  }

  return (
    <label className="relative flex flex-col items-end">
      <span className="sr-only">Price for {dish.name}</span>
      <span aria-hidden className="pointer-events-none absolute left-2.5 top-[13px] text-sm text-mondy-muted">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="Price"
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-invalid={Boolean(error)}
        className={`h-11 w-24 rounded-xl bg-mondy-cream pl-6 pr-2.5 text-right text-base tabular ring-1 placeholder:text-sm placeholder:text-mondy-red-dark/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50 ${
          error ? "ring-2 ring-mondy-red" : dish.needsPrice ? "ring-mondy-red/60" : "ring-mondy-border"
        }`}
      />
      {error && <span className="mt-0.5 text-[11px] text-mondy-red-dark">{error}</span>}
    </label>
  );
}
