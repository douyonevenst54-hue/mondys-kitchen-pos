"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ScanBarcode } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { linkBarcode, lookUpBarcode, removeBarcode, searchItemsForBarcode, type ScanLookup } from "@/app/api/barcode/actions";

type Item = { id: string; name: string; price: number; barcode: string; section: string; onRegister: boolean };

/**
 * Barcodes linked to menu items. Scan (or type) a code here to check it or
 * link it without ringing anything up. Most codes get linked right from the
 * register the first time a drink is scanned.
 */
export function BarcodeBoard({ items }: { items: Item[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanLookup | { status: "error"; error: string } | null>(null);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof searchItemsForBarcode>>>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (result?.status !== "unknown") return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchItemsForBarcode(q).catch(() => []);
      if (live) setMatches(r);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, result?.status]);

  function check(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => setResult(await lookUpBarcode(code)));
  }

  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="font-display text-2xl font-bold">Barcodes</h1>
        </header>

        <section aria-labelledby="check-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <h2 id="check-title" className="flex items-center gap-2 font-display text-xl font-bold">
            <ScanBarcode className="h-5 w-5 text-mondy-red" aria-hidden />
            Check or link a barcode
          </h2>
          <p className="mt-1 text-sm text-mondy-muted">
            Click the box and scan the item (or type the numbers under the barcode). On the register, scanning an unknown drink
            asks the same thing.
          </p>
          <form onSubmit={check} className="mt-3 flex gap-2">
            <label htmlFor="code" className="sr-only">
              Barcode
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setResult(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="012000001291"
              className="h-12 min-w-0 flex-1 rounded-lg bg-white px-3 text-lg tabular ring-1 ring-mondy-border focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
            <button type="submit" disabled={pending || !code.trim()} className="min-h-12 rounded-lg bg-mondy-ink px-4 font-semibold text-white disabled:opacity-50">
              Check
            </button>
          </form>

          {result && (
            <div role="status" className="mt-3 rounded-xl bg-mondy-cream/70 p-3 text-sm">
              {result.status === "error" && <p className="text-mondy-red-dark">{result.error}</p>}
              {(result.status === "ok" || result.status === "hidden") && (
                <p>
                  <strong>{result.item.name}</strong> · {formatMoney(result.item.price)}
                  {result.status === "hidden" && <span className="text-mondy-muted"> · {result.reason}</span>}
                </p>
              )}
              {result.status === "unknown" && (
                <>
                  <p className="font-semibold">Not linked yet. Link {result.code} to:</p>
                  <label className="mt-2 block text-sm font-medium">
                    Find the item
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="mt-1 block h-11 w-full rounded-lg bg-white px-3 ring-1 ring-mondy-border"
                      placeholder="Type part of the name"
                    />
                  </label>
                  <ul className="mt-2 divide-y divide-mondy-border rounded-lg bg-white ring-1 ring-mondy-border">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await linkBarcode(result.code, m.id, null, false);
                              if (r.ok) {
                                setMsg({ ok: true, text: `${result.code} now rings up ${r.item.name}` });
                                setResult(null);
                                setCode("");
                                router.refresh();
                              } else setMsg({ ok: false, text: r.error });
                            })
                          }
                          className="flex min-h-11 w-full justify-between gap-3 px-3 py-2 text-left hover:bg-mondy-cream"
                        >
                          <span>
                            {m.name} <span className="text-xs text-mondy-muted">· {m.section}</span>
                          </span>
                          <span className="tabular">{formatMoney(m.price)}</span>
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 && <li className="px-3 py-2 text-mondy-muted">No item with that name. Create it from Today&apos;s menu, or by scanning on the register.</li>}
                  </ul>
                </>
              )}
            </div>
          )}
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
              {msg.text}
            </p>
          )}
        </section>

        <section aria-labelledby="list-title" className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <h2 id="list-title" className="font-display text-xl font-bold">
            Linked items ({items.length})
          </h2>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-mondy-muted">None yet. Scan a drink on the register to start.</p>
          ) : (
            <ul className="mt-3 divide-y divide-mondy-border">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{i.name}</span> <span className="tabular">{formatMoney(i.price)}</span>
                    <span className="block text-xs text-mondy-muted">
                      <span className="tabular">{i.barcode}</span> · {i.section}
                      {!i.onRegister && " · hidden from the register"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await removeBarcode(i.id);
                        router.refresh();
                      })
                    }
                    className="min-h-11 rounded-lg px-3 text-sm font-semibold text-mondy-red-dark ring-1 ring-mondy-border hover:bg-mondy-cream"
                  >
                    Unlink<span className="sr-only"> {i.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-mondy-muted">Change a price on the Prices screen; the barcode keeps working.</p>
        </section>
      </div>
    </main>
  );
}
