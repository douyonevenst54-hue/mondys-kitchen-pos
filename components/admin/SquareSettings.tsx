"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, CreditCard, Globe, MonitorSmartphone, RotateCcw, TriangleAlert } from "lucide-react";
import { SquareTerminalCard, type SquareTerminalInfo } from "@/components/admin/SquareTerminalCard";

type Props = {
  square: { enabled: boolean; sandbox: boolean; problem: string | null };
  register: SquareTerminalInfo;
  kiosk: { paired: boolean; name: string | null; usesSquare: boolean; sameAsRegister: boolean };
  online: { provider: string | null; squareOff: boolean; webhook: boolean; webhookUrl: string };
  cloverStillSet: boolean;
};

const card = "rounded-2xl bg-white p-5 ring-1 ring-mondy-border";

export function SquareSettings(p: Props) {
  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-2xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-mondy-border">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="font-display text-2xl font-bold">Square setup</h1>
        </header>

        <section className={card} aria-labelledby="sq-account">
          <h2 id="sq-account" className="flex items-center gap-2 font-display text-lg font-bold">
            <CreditCard className="h-5 w-5 text-mondy-red" aria-hidden />
            Square account
          </h2>
          {p.square.enabled ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
              Connected{p.square.sandbox ? " · sandbox (test, no real charges)" : " · live"}
            </p>
          ) : (
            <div className="mt-1 space-y-2 text-sm">
              <p>Not connected yet: {p.square.problem}.</p>
              <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
                <li>
                  At <strong>developer.squareup.com</strong>, sign in with the restaurant&apos;s Square account and create an application.
                </li>
                <li>
                  Copy the <strong>Production access token</strong> and the <strong>location id</strong> (Locations tab).
                </li>
                <li>
                  In Vercel → Settings → Environment Variables add <code>SQUARE_ACCESS_TOKEN</code>, <code>SQUARE_LOCATION_ID</code> and{" "}
                  <code>SQUARE_ENVIRONMENT</code> = <code>production</code>, then redeploy.
                </li>
              </ol>
            </div>
          )}
        </section>

        <SquareTerminalCard
          square={p.register}
          target="register"
          title="Square Terminal at the register"
          intro="When the cashier taps Card, the total shows on this Terminal and the sale saves itself once the customer pays. Also used for card payments when online orders are picked up."
        />

        <section className={card} aria-labelledby="sq-kiosk">
          <h2 id="sq-kiosk" className="flex items-center gap-2 font-display text-lg font-bold">
            <MonitorSmartphone className="h-5 w-5 text-mondy-red" aria-hidden />
            Self-checkout
          </h2>
          <p className="mt-1 text-sm">
            {p.kiosk.paired
              ? `Terminal paired: ${p.kiosk.name ?? "Square Terminal"}${p.kiosk.usesSquare ? "" : " (the self-checkout isn't set to use it yet)"}.`
              : "No Terminal paired for the self-checkout. It needs its own, separate from the register's."}{" "}
            <Link href="/admin/self-checkout" className="font-semibold text-mondy-red-dark underline">
              Self-checkout setup
            </Link>
          </p>
          {p.kiosk.sameAsRegister && (
            <p role="status" className="mt-2 rounded-lg bg-mondy-yellow px-3 py-2 text-sm">
              The register and the self-checkout use the same Terminal. Each needs its own, or a customer at one could pay for the other&apos;s sale.
            </p>
          )}
        </section>

        <section className={card} aria-labelledby="sq-online">
          <h2 id="sq-online" className="flex items-center gap-2 font-display text-lg font-bold">
            <Globe className="h-5 w-5 text-mondy-red" aria-hidden />
            Online orders
          </h2>
          <p className="mt-1 text-sm">
            {p.online.provider === "Square"
              ? "Customers who pay online go to Square's secure checkout page, then come back to their order page. The kitchen gets the order once Square shows the payment."
              : p.online.squareOff
                ? `Online card payments use ${p.online.provider ?? "nothing"} because SQUARE_ONLINE_PAYMENTS is set to off.`
                : `Online card payments use ${p.online.provider ?? "nothing yet"}. They switch to Square as soon as Square is connected.`}
          </p>
          {p.online.provider === "Square" && (
            <div className="mt-3 rounded-xl bg-mondy-cream p-3 text-sm">
              {p.online.webhook ? (
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
                  Webhook on: paid orders reach the kitchen instantly.
                </p>
              ) : (
                <>
                  <p>
                    <strong>Optional, faster:</strong> without a webhook, the POS checks Square every few seconds while the customer&apos;s page or the Online orders screen is open. To make it instant, in the Square app → Webhooks → Add subscription, use this URL with the events <code>payment.created</code> and <code>payment.updated</code>, then put its signature key in <code>SQUARE_WEBHOOK_SIGNATURE_KEY</code>.
                  </p>
                  <CopyField value={p.online.webhookUrl} />
                </>
              )}
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="sq-refunds">
          <h2 id="sq-refunds" className="flex items-center gap-2 font-display text-lg font-bold">
            <RotateCcw className="h-5 w-5 text-mondy-red" aria-hidden />
            Refunds
          </h2>
          <p className="mt-1 text-sm">
            Voiding an order (manager PIN) refunds Square card payments to the customer&apos;s card automatically, for the register, the self-checkout and online orders. If Square can&apos;t refund, the order isn&apos;t voided and you see why.
          </p>
        </section>

        {p.cloverStillSet && p.square.enabled && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-mondy-yellow px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Clover settings are still in Vercel. Square is used first, so nothing breaks; once the last Clover orders are settled, delete the <code>CLOVER_…</code> variables.
            </span>
          </p>
        )}
      </div>
    </main>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={value} aria-label="Square webhook URL" className="h-11 min-w-0 flex-1 rounded-lg bg-white px-3 font-mono text-xs ring-1 ring-mondy-border" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-mondy-border"
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
