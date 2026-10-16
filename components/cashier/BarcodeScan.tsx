"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import {
  createBarcodeItem,
  linkBarcode,
  searchItemsForBarcode,
  showScannedItem,
  type ScanItem,
  type ScanLookup,
} from "@/app/api/barcode/actions";

/**
 * USB / Bluetooth barcode scanners act like a keyboard: they "type" the code
 * very fast and press Enter. This listens for that pattern anywhere on the
 * register (or in the search box), so cashiers never have to click a field.
 * Real typing is far slower than a scanner, so it isn't mistaken for a scan.
 */
export function useScannerInput(onScan: (code: string) => void, enabled: boolean) {
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    let fast = true;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const field = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // Typing in a form (a PIN, a name…) is never a scan, except the register search box.
      if (field && t?.dataset.scanTarget !== "search") return;
      // Another window is open on top of the register: leave it alone.
      if (document.querySelector('[aria-modal="true"]:not([data-scan-modal])')) return;
      const now = performance.now();
      if (e.key === "Enter") {
        if (buf.length >= 6 && fast && now - last < 100) {
          e.preventDefault();
          cb.current(buf);
        }
        buf = "";
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > 80) {
        buf = "";
        fast = true;
      } else if (now - last > 50) fast = false;
      buf += e.key;
      last = now;
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** Scan with the tablet's camera. Uses the browser's own detector when there is one, ZXing otherwise (iPad). */
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingStop: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (code: string) => {
      if (stopped) return;
      stopped = true;
      onCode(code);
    };

    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (stopped || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
          const tick = async () => {
            if (stopped || !video.current) return;
            try {
              const found = await det.detect(video.current);
              if (found[0]?.rawValue) return done(found[0].rawValue);
            } catch {
              /* frame not ready */
            }
            timer = setTimeout(tick, 150);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" }, audio: false },
            video.current ?? undefined,
            (result) => {
              if (result) done(result.getText());
            },
          );
          zxingStop = () => controls.stop();
          if (stopped) controls.stop();
        }
      } catch {
        setError("The camera isn't available. Allow camera access for this site in the browser settings, or use a barcode scanner.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div role="dialog" aria-modal="true" data-scan-modal aria-label="Scan with camera" className="fixed inset-0 z-50 flex items-center justify-center bg-mondy-ink/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3">
          <p className="font-display text-lg font-bold">Point the camera at the barcode</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full hover:bg-mondy-cream">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        {error ? (
          <p role="alert" className="px-5 pb-6 text-sm text-mondy-red-dark">
            {error}
          </p>
        ) : (
          <div className="relative bg-black">
            <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <span aria-hidden className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
      </div>
    </div>
  );
}

type Category = { id: string; name: string };

/** A code the register doesn't sell yet: link it, create the item, or put a hidden item back on. */
export function UnknownScan({
  lookup,
  categories,
  isManager,
  onSold,
  onClose,
}: {
  lookup: Extract<ScanLookup, { status: "unknown" | "hidden" }>;
  categories: Category[];
  isManager: boolean;
  onSold: (item: ScanItem) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"new" | "link">(lookup.status === "hidden" ? "link" : "new");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const drinks = categories.find((c) => /drink|beverage|bwason|fridge/i.test(c.name));
  const [categoryId, setCategoryId] = useState(drinks?.id ?? categories[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchItemsForBarcode>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = isManager ? null : pin;

  useEffect(() => {
    if (mode !== "link" || lookup.status === "hidden") return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchItemsForBarcode(q).catch(() => []);
      if (live) setResults(r);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, mode, lookup.status]);

  function run(fn: () => Promise<{ ok: true; item: ScanItem } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) onSold(r.item);
        else setError(r.error);
      } catch {
        setError("No connection. Try again.");
      }
    });
  }

  const field = "mt-1 block h-11 w-full rounded-lg border border-mondy-border bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-mondy-red/40";

  return (
    <div role="dialog" aria-modal="true" data-scan-modal aria-labelledby="scan-title" className="fixed inset-0 z-50 flex items-center justify-center bg-mondy-ink/50 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 font-sans shadow-2xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-mondy-red-dark">Barcode {lookup.code}</p>
            <h2 id="scan-title" className="mt-1 font-display text-xl font-bold">
              {lookup.status === "hidden" ? `${lookup.item.name} isn't on the register` : "This barcode isn't on the menu yet"}
            </h2>
            <p className="mt-1 text-sm text-mondy-muted">
              {lookup.status === "hidden"
                ? `${lookup.reason} ${formatMoney(lookup.item.price)}.`
                : "Add it once and the price shows up every time it's scanned."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-mondy-cream">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {lookup.status === "unknown" && (
          <div role="tablist" aria-label="How to add it" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-mondy-cream p-1 text-sm font-semibold">
            {(["new", "link"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-10 rounded-lg ${mode === m ? "bg-white shadow-sm" : "text-mondy-muted"}`}
              >
                {m === "new" ? "New item" : "Already on the menu"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {lookup.status === "unknown" && mode === "new" && (
            <>
              <label className="block text-sm font-medium">
                Name
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Coca-Cola 20 oz" maxLength={60} autoFocus />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Price ($)
                  <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="2.50" />
                </label>
                <label className="block text-sm font-medium">
                  Section
                  <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {lookup.status === "unknown" && mode === "link" && (
            <>
              <label className="block text-sm font-medium">
                Find the item
                <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type part of the name" autoFocus />
              </label>
              <ul className="max-h-60 divide-y divide-mondy-border overflow-y-auto rounded-xl ring-1 ring-mondy-border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={pending || (!isManager && pin.length < 4)}
                      onClick={() => run(() => linkBarcode(lookup.code, r.id, p))}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-mondy-cream disabled:opacity-60"
                    >
                      <span>
                        <span className="font-semibold">{r.name}</span>
                        <span className="block text-xs text-mondy-muted">
                          {r.section}
                          {r.barcode ? " · has another barcode" : ""}
                        </span>
                      </span>
                      <span className="tabular">{formatMoney(r.price)}</span>
                    </button>
                  </li>
                ))}
                {results.length === 0 && <li className="px-3 py-3 text-sm text-mondy-muted">No item with that name.</li>}
              </ul>
            </>
          )}

          {!isManager && (
            <label className="block text-sm font-medium">
              Manager PIN
              <input
                className={`${field} tracking-[0.4em]`}
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-mondy-red/10 px-3 py-2 text-sm text-mondy-red-dark">
              {error}
            </p>
          )}

          {lookup.status === "hidden" && (
            <button
              type="button"
              disabled={pending || (!isManager && pin.length < 4)}
              onClick={() => run(() => showScannedItem(lookup.item.id, p))}
              className="min-h-12 w-full rounded-xl bg-mondy-red px-4 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Put it on the register and add it"}
            </button>
          )}
          {lookup.status === "unknown" && mode === "new" && (
            <button
              type="button"
              disabled={pending || !name.trim() || !(Number(price) > 0) || (!isManager && pin.length < 4)}
              onClick={() => run(() => createBarcodeItem(lookup.code, { name, price: Number(price), categoryId }, p))}
              className="min-h-12 w-full rounded-xl bg-mondy-red px-4 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : `Save and add${Number(price) > 0 ? ` · ${formatMoney(Number(price))}` : ""}`}
            </button>
          )}
          {lookup.status === "unknown" && mode === "link" && (
            <p className="text-xs text-mondy-muted">Tap the item to link this barcode to it and add it to the order.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-mondy-ink px-3.5 text-sm font-semibold text-white hover:bg-black"
      title="Scan a barcode with the camera (a barcode scanner works anytime)"
    >
      <Camera className="h-4 w-4" aria-hidden />
      Scan
    </button>
  );
}

