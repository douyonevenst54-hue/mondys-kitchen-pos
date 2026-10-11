"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Minus, Plus, Trash2, X } from "lucide-react";
import { deleteDish, saveDish } from "@/app/menu/today/actions";
import type { TodayDish } from "@/lib/today-menu";

type DraftOption = { key: string; id?: string; name: string; price: string };
type DraftGroup = {
  key: string;
  id?: string;
  name: string;
  required: boolean;
  pick: number;
  free: number;
  sharedWith: number;
  options: DraftOption[];
};
export type DraftDish = {
  id?: string;
  name: string;
  description: string;
  price: string;
  sectionId: string; // "" = new section
  newSection: string;
  onToday: boolean;
  groups: DraftGroup[];
};

export type EditorStart = { mode: "new" } | { mode: "edit"; dish: TodayDish } | { mode: "copy"; prefill: DraftDish };

let n = 0;
const key = () => `k${++n}`;
const money = (v: number) => (v > 0 ? v.toFixed(2) : "");

function fromDish(d: TodayDish): DraftDish {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    price: money(d.price),
    sectionId: d.sectionId,
    newSection: "",
    onToday: d.onToday,
    groups: d.groups.map((g) => ({
      key: key(),
      id: g.id,
      name: g.name,
      required: g.min > 0,
      pick: Math.max(1, g.max),
      free: g.free,
      sharedWith: g.sharedWith,
      options: g.options.map((o) => ({ key: key(), id: o.id, name: o.name, price: money(o.price) })),
    })),
  };
}

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";
const field =
  "w-full rounded-xl bg-mondy-cream px-3 py-2.5 text-base ring-1 ring-mondy-border placeholder:text-mondy-muted/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50";

export function DishEditor({
  start,
  sections,
  onClose,
  onSaved,
  onCopy,
}: {
  start: EditorStart;
  sections: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onCopy: (prefill: DraftDish) => void;
}) {
  const [d, setD] = useState<DraftDish>(() =>
    start.mode === "edit"
      ? fromDish(start.dish)
      : start.mode === "copy"
        ? start.prefill
        : { name: "", description: "", price: "", sectionId: sections[0]?.id ?? "", newSection: "", onToday: true, groups: [] },
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = !d.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<DraftDish>) => setD((x) => ({ ...x, ...patch }));
  const setGroup = (k: string, patch: Partial<DraftGroup>) =>
    setD((x) => ({ ...x, groups: x.groups.map((g) => (g.key === k ? { ...g, ...patch } : g)) }));
  const setOption = (gk: string, ok: string, patch: Partial<DraftOption>) =>
    setD((x) => ({
      ...x,
      groups: x.groups.map((g) => (g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g)),
    }));

  function parseMoney(s: string, what: string, max: number): number {
    const clean = s.trim().replace(/^\$/, "");
    if (clean === "") return 0;
    if (!/^\d*(\.\d{0,2})?$/.test(clean) || Number(clean) > max) throw new Error(`${what}: enter an amount like 12.99`);
    return Math.round(Number(clean) * 100) / 100;
  }

  function save() {
    setError(null);
    let input;
    try {
      if (!d.sectionId && !d.newSection.trim()) throw new Error("Pick a section, or type a name for a new one");
      input = {
        id: d.id,
        name: d.name,
        description: d.description,
        price: parseMoney(d.price, "Price", 999.99),
        section: d.sectionId ? { id: d.sectionId } : { newName: d.newSection },
        onToday: d.onToday,
        groups: d.groups.map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          pick: g.pick,
          options: g.options
            .filter((o) => o.name.trim() || o.price.trim())
            .map((o) => ({ id: o.id, name: o.name, price: parseMoney(o.price, `${o.name || "Option"} extra charge`, 99.99) })),
        })),
      };
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    startTransition(async () => {
      const res = await saveDish(input);
      if (!res.ok) return setError(res.error);
      const name = d.name.trim();
      onSaved(
        isNew
          ? d.onToday
            ? `${name} added to today's menu.${input.price > 0 ? "" : " Type a price to show it."}`
            : `${name} saved in the library.`
          : `${name} saved.`,
      );
    });
  }

  function remove() {
    if (!d.id) return;
    startTransition(async () => {
      const res = await deleteDish(d.id!);
      if (!res.ok) return setError(res.error);
      onSaved(`${d.name} deleted.`);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dish-editor-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-mondy-ink/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white font-sans text-mondy-ink shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-mondy-border px-5 py-4">
          <h2 id="dish-editor-title" className="flex-1 font-display text-xl font-black">
            {isNew ? (start.mode === "copy" ? "Copy of a dish" : "New dish") : "Edit dish"}
          </h2>
          {!isNew && (
            <button
              type="button"
              onClick={() =>
                onCopy({
                  ...d,
                  id: undefined,
                  name: `${d.name} (copy)`.slice(0, 80),
                  onToday: true,
                  groups: d.groups.map((g) => ({ ...g, key: key(), id: undefined, sharedWith: 0, options: g.options.map((o) => ({ ...o, key: key(), id: undefined })) })),
                })
              }
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream ${ring}`}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Make a copy
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-2 text-mondy-muted hover:bg-mondy-cream ${ring}`}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Name</span>
            <input value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Rice & Pigeon Peas" className={field} />
          </label>

          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Section</span>
              <select value={d.sectionId} onChange={(e) => set({ sectionId: e.target.value })} className={field}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="">+ New section…</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Price</span>
              <span className="relative block">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mondy-muted">
                  $
                </span>
                <input value={d.price} inputMode="decimal" onChange={(e) => set({ price: e.target.value })} placeholder="0.00" className={`${field} pl-7 text-right tabular`} />
              </span>
            </label>
          </div>
          {!d.sectionId && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">New section name</span>
              <input value={d.newSection} maxLength={40} onChange={(e) => set({ newSection: e.target.value })} placeholder="Lunch Special" className={field} />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">
              Description <span className="font-normal text-mondy-muted">(optional)</span>
            </span>
            <textarea value={d.description} maxLength={300} rows={2} onChange={(e) => set({ description: e.target.value })} placeholder="Served with your choice of side and protein" className={field} />
          </label>

          {/* Choices */}
          <div>
            <p className="text-sm font-semibold">Choices</p>
            <p className="text-xs text-mondy-muted">
              What the customer picks with this dish, like a protein or a side. Leave the extra charge empty for free.
            </p>
            <div className="mt-3 space-y-3">
              {d.groups.map((g, gi) => (
                <fieldset key={g.key} className="rounded-2xl bg-mondy-yellow-soft p-3 ring-1 ring-mondy-border">
                  <legend className="sr-only">Choice {gi + 1}</legend>
                  <div className="flex items-center gap-2">
                    <input
                      value={g.name}
                      maxLength={40}
                      onChange={(e) => setGroup(g.key, { name: e.target.value })}
                      placeholder="Choice of protein"
                      aria-label={`Choice ${gi + 1} name`}
                      className={`${field} bg-white font-semibold`}
                    />
                    <button
                      type="button"
                      onClick={() => setD((x) => ({ ...x, groups: x.groups.filter((y) => y.key !== g.key) }))}
                      aria-label={`Remove choice ${g.name || gi + 1}`}
                      className={`rounded-lg p-2.5 text-mondy-muted ring-1 ring-mondy-border hover:bg-white ${ring}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {g.sharedWith > 0 && (
                    <p className="mt-1.5 text-xs text-mondy-muted">
                      Also on {g.sharedWith} other {g.sharedWith === 1 ? "dish" : "dishes"}. Changes here only apply to this dish.
                    </p>
                  )}
                  {g.free > 0 && <p className="mt-1 text-xs text-mondy-muted">First {g.free} included free.</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      Customer picks
                      <button
                        type="button"
                        aria-label="Fewer picks"
                        onClick={() => setGroup(g.key, { pick: Math.max(1, g.pick - 1) })}
                        className={`grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-mondy-border ${ring}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-4 text-center font-bold tabular" aria-live="polite">
                        {g.pick}
                      </span>
                      <button
                        type="button"
                        aria-label="More picks"
                        onClick={() => setGroup(g.key, { pick: Math.min(10, g.pick + 1) })}
                        className={`grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-mondy-border ${ring}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={g.required} onChange={(e) => setGroup(g.key, { required: e.target.checked })} className="h-5 w-5 accent-mondy-red" />
                      Must choose
                    </label>
                    <span className="text-xs text-mondy-muted">
                      {g.required ? (g.pick === 1 ? "Pick exactly 1" : `Pick exactly ${g.pick}`) : g.pick === 1 ? "Optional" : `Optional, up to ${g.pick}`}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-2">
                    {g.options.map((o, oi) => (
                      <li key={o.key} className="flex items-center gap-2">
                        <input
                          value={o.name}
                          maxLength={40}
                          onChange={(e) => setOption(g.key, o.key, { name: e.target.value })}
                          placeholder={oi === 0 ? "Chicken" : "Griot (fried pork)"}
                          aria-label={`Option ${oi + 1} of ${g.name || "choice"}`}
                          className={`${field} bg-white py-2`}
                        />
                        <span className="relative">
                          <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-mondy-muted">
                            +$
                          </span>
                          <input
                            value={o.price}
                            inputMode="decimal"
                            onChange={(e) => setOption(g.key, o.key, { price: e.target.value })}
                            placeholder="free"
                            aria-label={`Extra charge for ${o.name || `option ${oi + 1}`}`}
                            className={`${field} w-24 bg-white py-2 pl-8 text-right text-sm tabular`}
                          />
                        </span>
                        <button
                          type="button"
                          onClick={() => setGroup(g.key, { options: g.options.filter((y) => y.key !== o.key) })}
                          aria-label={`Remove option ${o.name || oi + 1}`}
                          className={`rounded-lg p-2 text-mondy-muted hover:bg-white ${ring}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setGroup(g.key, { options: [...g.options, { key: key(), name: "", price: "" }] })}
                    className={`mt-2 flex items-center gap-1 text-sm font-semibold text-mondy-red hover:text-mondy-red-dark ${ring}`}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add option
                  </button>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setD((x) => ({
                  ...x,
                  groups: [
                    ...x.groups,
                    { key: key(), name: "", required: true, pick: 1, free: 0, sharedWith: 0, options: [{ key: key(), name: "", price: "" }, { key: key(), name: "", price: "" }] },
                  ],
                }))
              }
              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-mondy-border px-4 py-3 text-sm font-semibold text-mondy-ink hover:bg-mondy-cream ${ring}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add a choice (protein, side, size…)
            </button>
          </div>

          {isNew && (
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={d.onToday} onChange={(e) => set({ onToday: e.target.checked })} className="h-5 w-5 accent-mondy-red" />
              Put it on today&apos;s menu
            </label>
          )}

          {!isNew && (
            <div className="border-t border-mondy-border pt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Delete {d.name} for good? Past orders keep their history.</span>
                  <button type="button" disabled={pending} onClick={remove} className={`rounded-lg bg-mondy-red px-3 py-2 font-semibold text-white ${ring}`}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={`rounded-lg px-3 py-2 font-semibold ring-1 ring-mondy-border ${ring}`}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className={`text-sm font-semibold text-mondy-red-dark underline-offset-2 hover:underline ${ring}`}>
                  Delete this dish
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-mondy-border px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-mondy-yellow px-3 py-2 text-sm font-medium text-mondy-red-dark">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`rounded-xl px-5 py-3 text-base font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream ${ring}`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className={`flex-1 rounded-xl bg-mondy-red px-5 py-3 text-base font-semibold text-white hover:bg-mondy-red-dark disabled:opacity-60 ${ring}`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
