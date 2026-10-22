"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, CreditCard, Lock, Mail, Minus, Plus, Printer, ScanBarcode, Trash2, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useBrand } from "@/components/brand/BrandProvider";
import { CameraScanner, useScannerInput } from "@/components/cashier/BarcodeScan";
import { exitKiosk, kioskCancel, kioskCheck, kioskPay, kioskReceipt, kioskScan, kioskSimulateTap } from "@/app/kiosk/actions";
import type { KioskPayState } from "@/lib/kiosk";

type Line = { id: string; name: string; price: number; qty: number };
type Phase =
  | { name: "scan" }
  | { name: "paying"; orderId: string; total: number; message: string | null }
  | { name: "paid"; orderId: string; total: number; card: string | null; orderNumber: number }
  | { name: "counter"; total: number; code: string; orderNumber: number };

/** Remember the last touch or scan (for the "Still there?" timer). */
function markActive(ref: { current: number }) {
  ref.current = Date.now();
}

const IDLE_MS = 90_000; // no touch or scan with items in the cart → "Still there?"
const IDLE_GRACE_S = 15;
const DONE_RESET_S = 25;

/**
 * Self-checkout for packaged and stickered food. Customers scan, watch each
 * price pop up, and pay on the card reader. Built for a tablet on a stand:
 * big type, big buttons, nothing to sign in to. Staff leave with a manager PIN.
 */
export function KioskApp({
  mode,
  taxRate,
  autoPrint,
  canPrint,
  canEmail,
  testTap,
  logoUrl,
}: {
  mode: "square" | "stripe" | "counter";
  taxRate: number;
  autoPrint: boolean;
  canPrint: boolean;
  canEmail: boolean;
  testTap: boolean;
  logoUrl: string | null;
}) {
  const brand = useBrand();
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "scan" });
  const [flash, setFlash] = useState<{ ok: boolean; title: string; detail?: string } | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idleAsk, setIdleAsk] = useState<number | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const lastTouch = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subtotal = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const show = useCallback((ok: boolean, title: string, detail?: string) => {
    setFlash({ ok, title, detail });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ok ? 3500 : 7000);
  }, []);

  const reset = useCallback(() => {
    setLines([]);
    setPhase({ name: "scan" });
    setFlash(null);
    setIdleAsk(null);
    setCamera(false);
  }, []);

  // ── Scanning ──
  const onCode = useCallback(
    async (code: string) => {
      lastTouch.current = Date.now();
      setIdleAsk(null);
      try {
        const r = await kioskScan(code);
        if (!r.ok) return show(false, r.error);
        const v = r.value;
        if (!v.ok) return show(false, v.message);
        setLines((ls) => {
          const found = ls.find((l) => l.id === v.item.id);
          if (found) return ls.map((l) => (l.id === v.item.id ? { ...l, qty: Math.min(l.qty + 1, 20) } : l));
          return [...ls, { ...v.item, qty: 1 }];
        });
        show(true, v.item.name, formatMoney(v.item.price));
      } catch {
        show(false, "No connection. Try scanning again in a moment.");
      }
    },
    [show],
  );
  useScannerInput((c) => void onCode(c), phase.name === "scan" && !camera && !exitOpen);

  function changeQty(id: string, delta: number) {
    markActive(lastTouch);
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, qty: Math.max(0, Math.min(l.qty + delta, 20)) } : l)).filter((l) => l.qty > 0));
  }

  // ── Paying ──
  async function pay() {
    setBusy(true);
    markActive(lastTouch);
    try {
      const r = await kioskPay(lines.map((l) => ({ menuItemId: l.id, quantity: l.qty })));
      if (!r.ok) return show(false, r.error);
      applyPay(r.value.orderId, r.value.pay);
    } catch {
      show(false, "No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const applyPay = useCallback(
    (orderId: string, p: KioskPayState) => {
      if (p.state === "paid") setPhase({ name: "paid", orderId, total: p.total, card: p.card, orderNumber: p.orderNumber });
      else if (p.state === "counter") setPhase({ name: "counter", total: p.total, code: p.code, orderNumber: p.orderNumber });
      else if (p.state === "canceled") {
        setPhase({ name: "scan" });
        show(false, p.message, "Your items are still here. Tap Pay to try again.");
      } else setPhase({ name: "paying", orderId, total: p.total, message: p.state === "failed" ? p.message : null });
    },
    [show],
  );

  // Watch the card reader while paying.
  const payingId = phase.name === "paying" ? phase.orderId : null;
  useEffect(() => {
    if (!payingId) return;
    const t = setInterval(async () => {
      try {
        const r = await kioskCheck(payingId);
        if (r.ok) applyPay(payingId, r.value);
      } catch {
        /* keep trying */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [payingId, applyPay]);

  async function cancelPay() {
    if (phase.name !== "paying") return;
    setBusy(true);
    try {
      const r = await kioskCancel(phase.orderId);
      if (r.ok) applyPay(phase.orderId, r.value);
      else show(false, r.error);
    } finally {
      setBusy(false);
    }
  }

  // ── Idle and done timers ──
  useEffect(() => {
    const t = setInterval(() => {
      if (phase.name === "scan" && lines.length > 0 && idleAsk === null && Date.now() - lastTouch.current > IDLE_MS) setIdleAsk(IDLE_GRACE_S);
    }, 1000);
    return () => clearInterval(t);
  }, [phase.name, lines.length, idleAsk]);
  useEffect(() => {
    if (idleAsk === null) return;
    if (idleAsk <= 0) {
      const t0 = setTimeout(reset, 0);
      return () => clearTimeout(t0);
    }
    const t = setTimeout(() => setIdleAsk((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [idleAsk, reset]);

  return (
    <div
      className="flex min-h-screen flex-col bg-mondy-cream font-sans text-mondy-ink"
      onPointerDown={() => {
        lastTouch.current = Date.now();
      }}
    >
      <header className="flex items-center justify-between gap-3 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          {logoUrl && <Image src={logoUrl} alt="" width={44} height={44} className="h-11 w-11 object-contain" />}
          <div className="leading-none">
            <p className="font-display text-2xl font-black uppercase">{brand.wordmark}</p>
            <p className="mt-1 text-sm font-semibold text-mondy-red-dark">Self-checkout</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExitOpen(true)}
          aria-label="Staff: leave self-checkout"
          className="grid h-12 w-12 place-items-center rounded-full text-mondy-muted hover:bg-mondy-cream"
        >
          <Lock className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {flash && (
        <div
          role={flash.ok ? "status" : "alert"}
          aria-live="assertive"
          className={`mx-4 mt-4 flex items-center justify-between gap-4 rounded-3xl px-6 py-5 text-white shadow-lg ${flash.ok ? "bg-emerald-700" : "bg-red-700"}`}
        >
          <span>
            <span className="block text-2xl font-black sm:text-3xl">{flash.title}</span>
            {flash.detail && !flash.ok && <span className="mt-1 block text-lg">{flash.detail}</span>}
          </span>
          {flash.ok && flash.detail && <span className="shrink-0 text-4xl font-black tabular sm:text-5xl">{flash.detail}</span>}
        </div>
      )}

      {phase.name === "scan" && (
        <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
          <section aria-label="Your items" className="flex min-h-[40vh] flex-col rounded-3xl bg-white p-5 shadow-sm">
            {lines.length === 0 ? (
              <div className="m-auto max-w-md text-center">
                <ScanBarcode className="mx-auto h-24 w-24 text-mondy-red" aria-hidden />
                <h1 className="mt-4 font-display text-4xl font-black">Scan your items</h1>
                <p className="mt-2 text-xl text-mondy-muted">Hold each barcode under the scanner. The price shows up right here.</p>
                <button
                  type="button"
                  onClick={() => setCamera(true)}
                  className="mx-auto mt-8 flex min-h-14 items-center gap-2 rounded-2xl px-6 text-lg font-semibold ring-2 ring-mondy-border hover:bg-mondy-cream"
                >
                  <Camera className="h-6 w-6" aria-hidden />
                  Use the camera instead
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-display text-2xl font-black">Your items ({count})</h1>
                <ul className="mt-3 flex-1 divide-y divide-mondy-border overflow-y-auto">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-bold leading-tight">{l.name}</p>
                        <p className="text-mondy-muted tabular">{formatMoney(l.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${l.name}`}>
                        <button type="button" onClick={() => changeQty(l.id, -1)} aria-label={l.qty === 1 ? `Remove ${l.name}` : `One less ${l.name}`} className="grid h-14 w-14 place-items-center rounded-full ring-2 ring-mondy-border">
                          {l.qty === 1 ? <Trash2 className="h-5 w-5" aria-hidden /> : <Minus className="h-5 w-5" aria-hidden />}
                        </button>
                        <span className="w-10 text-center text-2xl font-black tabular" aria-live="polite">
                          {l.qty}
                        </span>
                        <button type="button" onClick={() => changeQty(l.id, 1)} aria-label={`One more ${l.name}`} className="grid h-14 w-14 place-items-center rounded-full ring-2 ring-mondy-border">
                          <Plus className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                      <span className="w-24 text-right text-xl font-black tabular">{formatMoney(l.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setCamera(true)}
                  className="mt-3 flex min-h-12 items-center gap-2 self-start rounded-xl px-4 font-semibold ring-2 ring-mondy-border"
                >
                  <Camera className="h-5 w-5" aria-hidden />
                  Scan with camera
                </button>
              </>
            )}
          </section>

          <aside aria-label="Total" className="flex flex-col rounded-3xl bg-white p-5 shadow-sm">
            <dl className="space-y-2 text-lg">
              <div className="flex justify-between">
                <dt className="text-mondy-muted">Subtotal</dt>
                <dd className="tabular">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mondy-muted">Meals tax</dt>
                <dd className="tabular">{formatMoney(tax)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-mondy-border pt-3">
                <dt className="text-2xl font-black">Total</dt>
                <dd className="text-4xl font-black tabular" aria-live="polite">
                  {formatMoney(total)}
                </dd>
              </div>
            </dl>
            <div className="mt-auto space-y-3 pt-6">
              <button
                type="button"
                disabled={lines.length === 0 || busy}
                onClick={() => void pay()}
                className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-mondy-red px-6 text-2xl font-black text-white shadow-md hover:bg-mondy-red-dark disabled:opacity-40"
              >
                <CreditCard className="h-7 w-7" aria-hidden />
                {busy ? "One moment…" : mode === "counter" ? "Pay at the counter" : `Pay ${formatMoney(total)}`}
              </button>
              {lines.length > 0 && (
                <button type="button" onClick={reset} className="min-h-14 w-full rounded-2xl text-lg font-semibold ring-2 ring-mondy-border">
                  Start over
                </button>
              )}
              <p className="text-center text-sm text-mondy-muted">
                {mode === "counter" ? "You'll get a code to show at the counter." : "Tap, insert or swipe your card on the reader."}
              </p>
            </div>
          </aside>
        </main>
      )}

      {phase.name === "paying" && (
        <main className="grid flex-1 place-items-center p-6 text-center" aria-live="polite">
          <div className="max-w-lg">
            <CreditCard className="mx-auto h-24 w-24 animate-pulse text-mondy-red" aria-hidden />
            <p className="mt-6 text-6xl font-black tabular">{formatMoney(phase.total)}</p>
            <h1 className="mt-4 font-display text-3xl font-black">Tap, insert or swipe your card on the reader</h1>
            {phase.message ? (
              <p role="alert" className="mt-4 rounded-2xl bg-red-700 px-5 py-3 text-lg font-semibold text-white">
                {phase.message} Try again on the reader, or cancel.
              </p>
            ) : (
              <p className="mt-3 text-lg text-mondy-muted">Waiting for your card…</p>
            )}
            <button type="button" onClick={() => void cancelPay()} disabled={busy} className="mt-10 min-h-14 rounded-2xl px-8 text-lg font-semibold ring-2 ring-mondy-border disabled:opacity-50">
              Cancel
            </button>
            {testTap && (
              <button
                type="button"
                onClick={async () => {
                  const r = await kioskSimulateTap(phase.orderId);
                  if (r.ok) applyPay(phase.orderId, r.value);
                }}
                className="ml-3 mt-10 min-h-14 rounded-2xl bg-mondy-ink px-6 text-lg font-semibold text-white"
              >
                Test: tap a card
              </button>
            )}
          </div>
        </main>
      )}

      {phase.name === "paid" && <Done phase={phase} autoPrint={autoPrint} canPrint={canPrint} canEmail={canEmail} onDone={reset} />}

      {phase.name === "counter" && (
        <main className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-lg">
            <h1 className="font-display text-3xl font-black">Please pay at the counter</h1>
            <p className="mt-3 text-xl text-mondy-muted">Show this code to a staff member.</p>
            <p className="mt-6 rounded-3xl bg-white px-8 py-6 font-display text-6xl font-black tracking-wider tabular shadow-sm">{phase.code}</p>
            <p className="mt-4 text-3xl font-black tabular">{formatMoney(phase.total)}</p>
            <AutoReset seconds={45} onDone={reset} label="New customer" />
          </div>
        </main>
      )}

      {camera && (
        <CameraScanner
          onClose={() => setCamera(false)}
          onCode={(c) => {
            setCamera(false);
            void onCode(c);
          }}
        />
      )}

      {idleAsk !== null && (
        <div role="alertdialog" aria-modal="true" data-scan-modal aria-labelledby="idle-title" className="fixed inset-0 z-50 grid place-items-center bg-mondy-ink/60 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center">
            <h2 id="idle-title" className="font-display text-3xl font-black">
              Still there?
            </h2>
            <p className="mt-2 text-lg text-mondy-muted">Starting over in {idleAsk} seconds.</p>
            <button
              type="button"
              onClick={() => {
                lastTouch.current = Date.now();
                setIdleAsk(null);
              }}
              className="mt-6 min-h-16 w-full rounded-2xl bg-mondy-red text-xl font-black text-white"
              autoFocus
            >
              I&apos;m still here
            </button>
          </div>
        </div>
      )}

      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} onExit={() => router.push("/")} />}
    </div>
  );
}

function Done({
  phase,
  autoPrint,
  canPrint,
  canEmail,
  onDone,
}: {
  phase: Extract<Phase, { name: "paid" }>;
  autoPrint: boolean;
  canPrint: boolean;
  canEmail: boolean;
  onDone: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(autoPrint && canPrint ? "Your receipt is printing." : null);
  const [email, setEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function receipt(how: "print" | "email") {
    setBusy(true);
    try {
      const r = await kioskReceipt(phase.orderId, how, email);
      setMsg(r.ok ? r.value : r.error);
      if (r.ok && how === "email") setAskEmail(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid flex-1 place-items-center p-6 text-center">
      <div className="w-full max-w-lg">
        <CheckCircle2 className="mx-auto h-24 w-24 text-emerald-700" aria-hidden />
        <h1 className="mt-4 font-display text-4xl font-black">Thank you!</h1>
        <p className="mt-2 text-2xl">
          Paid <strong className="tabular">{formatMoney(phase.total)}</strong>
          {phase.card ? ` with ${phase.card}` : ""}
        </p>
        <p className="mt-1 text-mondy-muted">Order #{phase.orderNumber}</p>

        {msg && (
          <p role="status" className="mt-6 rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm">
            {msg}
          </p>
        )}

        {!askEmail ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {canPrint && !(autoPrint && msg) && (
              <button type="button" disabled={busy} onClick={() => void receipt("print")} className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-lg font-semibold ring-2 ring-mondy-border">
                <Printer className="h-5 w-5" aria-hidden />
                Print receipt
              </button>
            )}
            {canEmail && (
              <button type="button" onClick={() => setAskEmail(true)} className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-lg font-semibold ring-2 ring-mondy-border">
                <Mail className="h-5 w-5" aria-hidden />
                Email receipt
              </button>
            )}
          </div>
        ) : (
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void receipt("email");
            }}
          >
            <label htmlFor="receipt-email" className="sr-only">
              Your email
            </label>
            <input
              id="receipt-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-14 min-w-0 flex-1 rounded-2xl bg-white px-4 text-lg ring-2 ring-mondy-border"
              autoFocus
            />
            <button type="submit" disabled={busy} className="min-h-14 rounded-2xl bg-mondy-ink px-5 text-lg font-semibold text-white">
              Send
            </button>
          </form>
        )}
        <AutoReset seconds={DONE_RESET_S} onDone={onDone} label="Done" paused={askEmail} />
      </div>
    </main>
  );
}

function AutoReset({ seconds, onDone, label, paused }: { seconds: number; onDone: () => void; label: string; paused?: boolean }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      const t0 = setTimeout(onDone, 0);
      return () => clearTimeout(t0);
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone, paused]);
  return (
    <button type="button" onClick={onDone} className="mt-8 min-h-16 w-full rounded-2xl bg-mondy-red text-xl font-black text-white">
      {label}
      {!paused && <span className="ml-2 font-semibold">({left})</span>}
    </button>
  );
}

function ExitDialog({ onClose, onExit }: { onClose: () => void; onExit: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="dialog" aria-modal="true" data-scan-modal aria-labelledby="exit-title" className="fixed inset-0 z-50 grid place-items-center bg-mondy-ink/60 p-6">
      <form
        className="w-full max-w-sm rounded-3xl bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await exitKiosk(pin);
          if (r.ok) onExit();
          else {
            setError(r.error ?? "That's not a manager PIN");
            setPin("");
          }
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="exit-title" className="font-display text-xl font-black">
            Staff only
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full hover:bg-mondy-cream">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <label className="mt-3 block text-sm font-medium">
          Manager PIN to leave self-checkout
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="mt-1 h-14 w-full rounded-xl px-4 text-center text-2xl tracking-[0.4em] ring-2 ring-mondy-border"
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-mondy-red-dark">
            {error}
          </p>
        )}
        <button type="submit" disabled={pin.length < 4} className="mt-4 min-h-14 w-full rounded-xl bg-mondy-ink font-semibold text-white disabled:opacity-50">
          Leave
        </button>
      </form>
    </div>
  );
}
