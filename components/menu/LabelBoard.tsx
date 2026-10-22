"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Minus, Plus, Printer, ScanBarcode } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { asEan13 } from "@/lib/ean13";
import { LABEL_SIZES, type LabelSize } from "@/lib/labels";
import { assignStoreBarcode, saveLabelSize } from "@/app/menu/labels/actions";
import { Ean13 } from "./Ean13";

type Item = { id: string; name: string; price: number; barcode: string | null };
type Section = { name: string; items: Item[] };

const fmt = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${m}/${d}`;
};
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * Print barcode stickers for food made in house (self-serve fridge, grab-and-go).
 * Pick how many of each, the sticker size and dates, then Print. The stickers
 * scan at the self-checkout and the register.
 */
export function LabelBoard({ sections, initialSize, today }: { sections: Section[]; initialSize: string; today: string }) {
  const [codes, setCodes] = useState<Record<string, string | null>>(
    Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.id, i.barcode]))),
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [size, setSize] = useState<LabelSize>((initialSize in LABEL_SIZES ? initialSize : "2.25x1.25") as LabelSize);
  const [showPrice, setShowPrice] = useState(true);
  const [packed, setPacked] = useState(today);
  const [useByDays, setUseByDays] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const term = q.trim().toLowerCase();
  const shown = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !term || i.name.toLowerCase().includes(term)) }))
    .filter((s) => s.items.length);
  const toPrint = items.flatMap((i) => Array.from({ length: qty[i.id] ?? 0 }, () => i)).filter((i) => asEan13(codes[i.id]));
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const dims = LABEL_SIZES[size];
  const small = size === "1.5x1";
  const useBy = useByDays ? addDays(packed, Number(useByDays)) : null;

  function setCount(id: string, n: number) {
    setQty((m) => ({ ...m, [id]: Math.max(0, Math.min(n, 200)) }));
  }

  function giveCode(id: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await assignStoreBarcode(id);
      if (r.ok) {
        setCodes((c) => ({ ...c, [id]: r.barcode }));
        setCount(id, Math.max(qty[id] ?? 0, 1));
      } else setMsg(r.error);
    });
  }

  function print() {
    void saveLabelSize(size);
    setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <style>{`
        @media print {
          @page { ${dims.sheet ? "size: letter; margin: 0.5in 0.1875in;" : `size: ${dims.w}in ${dims.h}in; margin: 0;`} }
          body * { visibility: hidden !important; }
          #label-print, #label-print * { visibility: visible !important; }
          #label-print { position: absolute; left: 0; top: 0; display: block !important; }
          html, body { background: #fff !important; }
        }
      `}</style>

      <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink print:hidden">
        <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
          <header className="flex items-center justify-between gap-3">
            <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Register
            </Link>
            <h1 className="font-display text-2xl font-bold">Barcode stickers</h1>
          </header>

          <section aria-labelledby="opts" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <h2 id="opts" className="font-display text-lg font-bold">
              Sticker options
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Sticker size
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as LabelSize)}
                  className="mt-1 block h-11 w-full rounded-lg bg-white px-3 ring-1 ring-mondy-border"
                >
                  {Object.entries(LABEL_SIZES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                <input type="checkbox" className="h-5 w-5 accent-mondy-red" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                Print the price on the sticker
              </label>
              <label className="text-sm font-medium">
                Packed on
                <input type="date" value={packed} onChange={(e) => setPacked(e.target.value || today)} className="mt-1 block h-11 w-full rounded-lg px-3 ring-1 ring-mondy-border" />
              </label>
              <label className="text-sm font-medium">
                Use by
                <select value={useByDays} onChange={(e) => setUseByDays(e.target.value)} className="mt-1 block h-11 w-full rounded-lg bg-white px-3 ring-1 ring-mondy-border">
                  <option value="">Don&apos;t print</option>
                  {[1, 2, 3, 5, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} day{n > 1 ? "s" : ""} after packing ({fmt(addDays(packed, n))})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section aria-labelledby="items" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="items" className="font-display text-lg font-bold">
                How many of each
              </h2>
              <label className="w-full sm:w-64">
                <span className="sr-only">Search items</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className="h-11 w-full rounded-lg px-3 ring-1 ring-mondy-border" />
              </label>
            </div>
            {msg && (
              <p role="alert" className="mt-2 text-sm text-mondy-red-dark">
                {msg}
              </p>
            )}
            {shown.map((s) => (
              <div key={s.name} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-mondy-muted">{s.name}</h3>
                <ul className="mt-1 divide-y divide-mondy-border">
                  {s.items.map((i) => {
                    const code = codes[i.id];
                    const printable = Boolean(asEan13(code));
                    const n = qty[i.id] ?? 0;
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{i.name}</span> <span className="tabular text-mondy-muted">{formatMoney(i.price)}</span>
                          <span className="block text-xs text-mondy-muted">
                            {printable ? <span className="tabular">{code}</span> : code ? "Has a barcode that can't be printed here (manufacturer code)" : "No barcode yet"}
                          </span>
                        </span>
                        {printable ? (
                          <span className="flex items-center gap-1" role="group" aria-label={`Stickers for ${i.name}`}>
                            <button type="button" onClick={() => setCount(i.id, n - 1)} aria-label={`One less ${i.name} sticker`} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-mondy-border">
                              <Minus className="h-4 w-4" aria-hidden />
                            </button>
                            <input
                              aria-label={`Number of ${i.name} stickers`}
                              inputMode="numeric"
                              value={n}
                              onChange={(e) => setCount(i.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                              className="h-11 w-14 rounded-lg text-center tabular ring-1 ring-mondy-border"
                            />
                            <button type="button" onClick={() => setCount(i.id, n + 1)} aria-label={`One more ${i.name} sticker`} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-mondy-border">
                              <Plus className="h-4 w-4" aria-hidden />
                            </button>
                          </span>
                        ) : !code ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => giveCode(i.id)}
                            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream disabled:opacity-50"
                          >
                            <ScanBarcode className="h-4 w-4" aria-hidden />
                            Create barcode<span className="sr-only"> for {i.name}</span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {toPrint.length > 0 && (
            <section aria-labelledby="preview" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
              <h2 id="preview" className="font-display text-lg font-bold">
                Preview
              </h2>
              <div className="mt-3 flex flex-wrap gap-3">
                <Sticker item={toPrint[0]} code={codes[toPrint[0].id]!} dims={dims} showPrice={showPrice} packed={packed} useBy={useBy} small={small} preview />
              </div>
            </section>
          )}

          <div className="sticky bottom-0 -mx-4 bg-mondy-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <button
              type="button"
              disabled={total === 0}
              onClick={print}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mondy-red px-4 font-semibold text-white disabled:opacity-50"
            >
              <Printer className="h-5 w-5" aria-hidden />
              Print {total} sticker{total === 1 ? "" : "s"}
            </button>
            <p className="mt-1 text-center text-xs text-mondy-muted">
              In the print window, pick the label printer and set the paper to the sticker size, margins none, scale 100%.
            </p>
          </div>
        </div>
      </main>

      <div id="label-print" className="hidden">
        {dims.sheet ? (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${dims.w}in)`, columnGap: "0.125in", gridAutoRows: `${dims.h}in` }}>
            {toPrint.map((i, n) => (
              <Sticker key={n} item={i} code={codes[i.id]!} dims={dims} showPrice={showPrice} packed={packed} useBy={useBy} small={false} />
            ))}
          </div>
        ) : (
          toPrint.map((i, n) => (
            <div key={n} style={{ breakAfter: "page", pageBreakAfter: "always" }}>
              <Sticker item={i} code={codes[i.id]!} dims={dims} showPrice={showPrice} packed={packed} useBy={useBy} small={small} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Sticker({
  item,
  code,
  dims,
  showPrice,
  packed,
  useBy,
  small,
  preview,
}: {
  item: Item;
  code: string;
  dims: { w: number; h: number };
  showPrice: boolean;
  packed: string;
  useBy: string | null;
  small: boolean;
  preview?: boolean;
}) {
  return (
    <div
      style={{ width: `${dims.w}in`, height: `${dims.h}in`, padding: "0.06in 0.08in", boxSizing: "border-box", overflow: "hidden" }}
      className={`flex flex-col bg-white text-black ${preview ? "rounded ring-1 ring-mondy-border" : ""}`}
    >
      <div className="flex items-start justify-between gap-1" style={{ fontSize: small ? "7pt" : "8.5pt", lineHeight: 1.1 }}>
        <span className="font-bold" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.name}
        </span>
        {showPrice && <span className="shrink-0 font-black" style={{ fontSize: small ? "8pt" : "11pt" }}>{formatMoney(item.price)}</span>}
      </div>
      <div className="mt-auto">
        <Ean13 code={code} dots={small ? 2 : 3} heightIn={small ? 0.36 : dims.h >= 1.2 ? 0.48 : 0.4} />
      </div>
      <div style={{ fontSize: small ? "5.5pt" : "6.5pt" }} className="flex justify-between">
        <span>Packed {fmt(packed)}</span>
        {useBy && <span className="font-bold">Use by {fmt(useBy)}</span>}
      </div>
    </div>
  );
}
