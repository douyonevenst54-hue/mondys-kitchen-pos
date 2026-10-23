"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Copy, CreditCard, ExternalLink, Printer, ScanBarcode } from "lucide-react";
import { setKioskOptions, testPrint } from "@/app/admin/self-checkout/actions";
import { SquareTerminalCard, type SquareTerminalInfo } from "@/components/admin/SquareTerminalCard";

type Props = {
  payment: string;
  autoPrint: boolean;
  activeMode: "square" | "stripe" | "counter";
  modeProblem: string | null;
  square: SquareTerminalInfo;
  stripeReader: string | null;
  printer: { mac: string | null; online: boolean; waiting: number; url: string };
  stickered: number;
};

const card = "rounded-2xl bg-white p-5 ring-1 ring-mondy-border";

export function SelfCheckoutSettings(p: Props) {
  const router = useRouter();
  const [payment, setPayment] = useState(p.payment);
  const [autoPrint, setAutoPrint] = useState(p.autoPrint);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { payment?: string; autoPrint?: boolean }) {
    const v = { payment: next.payment ?? payment, autoPrint: next.autoPrint ?? autoPrint };
    setPayment(v.payment);
    setAutoPrint(v.autoPrint);
    setMsg(null);
    startTransition(async () => {
      const r = await setKioskOptions(v);
      setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-2xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="font-display text-2xl font-bold">Self-checkout</h1>
        </header>

        <section className={card} aria-labelledby="steps">
          <h2 id="steps" className="font-display text-lg font-bold">
            How it works
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            <li>
              Print barcode stickers for the self-serve food on{" "}
              <Link href="/menu/labels" className="font-semibold text-mondy-red-dark underline">
                Barcode stickers
              </Link>{" "}
              ({p.stickered} item{p.stickered === 1 ? "" : "s"} have a barcode).
            </li>
            <li>Put a tablet on a stand next to the food with a barcode scanner and the card reader.</li>
            <li>Sign in on the tablet and open the self-checkout screen. Customers scan, see the price, tap their card, and get a receipt.</li>
          </ol>
          <Link
            href="/kiosk"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-mondy-red px-4 text-sm font-semibold text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open the self-checkout screen
          </Link>
          <p className="mt-2 text-xs text-mondy-muted">On the tablet, also turn on Guided Access (iPad) or screen pinning (Android) so customers stay on this screen.</p>
        </section>

        <section className={card} aria-labelledby="pay-title">
          <h2 id="pay-title" className="flex items-center gap-2 font-display text-lg font-bold">
            <CreditCard className="h-5 w-5 text-mondy-red" aria-hidden />
            How customers pay
          </h2>
          <fieldset className="mt-3 space-y-2" aria-label="Payment for self-checkout">
            {[
              { v: "square", t: "Square Terminal", d: "Customer taps on the Square Terminal; the sale completes by itself." },
              { v: "stripe", t: "Stripe reader", d: p.stripeReader ? `Uses ${p.stripeReader} (paired in Card reader settings).` : "Pair it first in Card reader settings." },
              { v: "counter", t: "Pay at the counter", d: "No reader at the self-checkout. The order shows on Online orders for staff to take the payment." },
            ].map((o) => (
              <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ${payment === o.v ? "ring-2 ring-mondy-red" : "ring-mondy-border"}`}>
                <input type="radio" name="kiosk-pay" className="mt-1 h-5 w-5 accent-mondy-red" checked={payment === o.v} onChange={() => save({ payment: o.v })} disabled={pending} />
                <span>
                  <span className="block font-semibold">{o.t}</span>
                  <span className="block text-sm text-mondy-muted">{o.d}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {p.modeProblem && (
            <p role="status" className="mt-3 rounded-lg bg-mondy-yellow px-3 py-2 text-sm">
              Right now the self-checkout uses <strong>Pay at the counter</strong>: {p.modeProblem}.
            </p>
          )}
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
              {msg.text}
            </p>
          )}
        </section>

        <SquareTerminalCard
          square={p.square}
          target="kiosk"
          title="Square Terminal at the self-checkout"
          intro="Its own Terminal, next to the self-checkout tablet. The register's Terminal is paired in Square setup."
        />

        <section className={card} aria-labelledby="print-title">
          <h2 id="print-title" className="flex items-center gap-2 font-display text-lg font-bold">
            <Printer className="h-5 w-5 text-mondy-red" aria-hidden />
            Receipt printer
          </h2>
          <p className="mt-1 text-sm">
            {p.printer.mac ? (
              <>
                <span className={p.printer.online ? "font-semibold text-emerald-700" : "font-semibold text-mondy-red-dark"}>
                  {p.printer.online ? "Connected" : "Not checking in"}
                </span>{" "}
                · printer {p.printer.mac}
                {p.printer.waiting > 0 && ` · ${p.printer.waiting} waiting to print`}
              </>
            ) : (
              "No printer has connected yet."
            )}
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
            <li>Use a Star printer with CloudPRNT (mC-Print3 or TSP143IV), on the restaurant&apos;s Wi-Fi or network cable.</li>
            <li>Open the printer&apos;s settings page (its IP address, printed when you hold the FEED button at power-on).</li>
            <li>
              Under <strong>CloudPRNT</strong>, turn it on and paste this as the <strong>Server URL</strong>, polling every 5 seconds:
            </li>
          </ol>
          <CopyField value={p.printer.url} />
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-mondy-red" checked={autoPrint} onChange={(e) => save({ autoPrint: e.target.checked })} disabled={pending} />
            Print the receipt automatically after each payment
          </label>
          <TestPrintButton />
        </section>

        <section className={card} aria-labelledby="hw-title">
          <h2 id="hw-title" className="flex items-center gap-2 font-display text-lg font-bold">
            <ScanBarcode className="h-5 w-5 text-mondy-red" aria-hidden />
            Hardware that works
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            <li>Barcode scanner in keyboard (HID) mode with Enter after each scan, on a stand in auto-sense mode (e.g. ScanAvenger SA9400).</li>
            <li>Card reader: Square Terminal, or Stripe S700/S710.</li>
            <li>Receipt printer: Star mC-Print3 or TSP143IV (CloudPRNT).</li>
            <li>Sticker printer: any thermal label printer with 2.25&quot; × 1.25&quot; labels (e.g. Zebra, Rollo, Brother).</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={value} aria-label="CloudPRNT server URL" className="h-11 min-w-0 flex-1 rounded-lg bg-mondy-cream px-3 font-mono text-xs ring-1 ring-mondy-border" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-mondy-border"
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function TestPrintButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setMsg((await testPrint()).ok ? "Test print sent. It prints the next time the printer checks in (a few seconds)." : "Couldn't send"))}
        className="min-h-11 rounded-lg px-4 text-sm font-semibold ring-1 ring-mondy-border disabled:opacity-50"
      >
        Print a test receipt
      </button>
      {msg && (
        <p role="status" className="mt-1 text-sm text-mondy-muted">
          {msg}
        </p>
      )}
    </div>
  );
}
