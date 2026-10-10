"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, CreditCard, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { pairCardReader, unpairCardReader } from "@/app/admin/card-reader/actions";
import type { ReaderInfo } from "@/lib/terminal";

type Address = { line1: string; city: string; state: string; postalCode: string };

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";
const field =
  "w-full rounded-xl bg-mondy-cream px-3 py-2.5 text-base ring-1 ring-mondy-border placeholder:text-mondy-muted/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50";

export function CardReaderSettings({
  stripeProblem,
  testMode,
  reader,
  needsAddress,
  address: initialAddress,
}: {
  stripeProblem: string | null;
  testMode: boolean;
  reader: ReaderInfo | null;
  needsAddress: boolean;
  address: Address;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("Front counter");
  const [address, setAddress] = useState(initialAddress);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pair(registrationCode: string, name: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await pairCardReader({ code: registrationCode, label: name, address: needsAddress ? address : null });
      if (!res.ok) return setError(res.error);
      setCode("");
      setNotice("Reader paired. It's ready for pickup payments.");
      router.refresh();
    });
  }

  function unpair() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await unpairCardReader();
      if (!res.ok) return setError(res.error);
      setNotice("Reader removed from the POS.");
      router.refresh();
    });
  }

  const paired = reader?.paired;

  return (
    <main className="min-h-screen bg-mondy-cream py-6 font-sans text-mondy-ink">
      <div className="mx-auto max-w-2xl space-y-5 px-4 sm:px-6">
        <header className="flex items-center justify-between">
          <Link
            href="/online"
            className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to online orders
          </Link>
          <h1 className="font-display text-xl font-bold">Card reader</h1>
        </header>

        <p className="px-1 text-sm text-mondy-muted">
          Pair the Stripe card reader on the counter. When a customer picks up an order they haven&apos;t paid for, staff
          tap <b>Charge on card reader</b>: the total appears on the reader and the POS marks the order paid as soon as
          the card goes through.
        </p>

        <div aria-live="polite">
          {notice && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">{notice}</p>}
          {error && (
            <p role="alert" className="rounded-xl bg-mondy-yellow px-4 py-3 text-sm font-medium text-mondy-red-dark">
              {error}
            </p>
          )}
        </div>

        {stripeProblem ? (
          <section className="rounded-2xl bg-mondy-yellow px-5 py-4 ring-1 ring-mondy-red/40">
            <p className="text-sm font-semibold">Stripe isn&apos;t set up yet</p>
            <p className="mt-1 text-sm">Reason: {stripeProblem}. Add the Stripe keys in Vercel first.</p>
          </section>
        ) : paired && reader ? (
          <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mondy-cream text-mondy-red">
                <CreditCard className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-black">{reader.label ?? "Card reader"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                  {reader.status === "online" ? (
                    <>
                      <Wifi className="h-4 w-4 text-green-700" aria-hidden />
                      <span className="font-semibold text-green-800">Online, ready to take payments</span>
                    </>
                  ) : reader.status === "offline" ? (
                    <>
                      <WifiOff className="h-4 w-4 text-mondy-red" aria-hidden />
                      <span className="font-semibold text-mondy-red-dark">Offline: check that it&apos;s on and on Wi-Fi</span>
                    </>
                  ) : (
                    <span className="text-mondy-muted">Status unknown</span>
                  )}
                </p>
                {reader.simulated && (
                  <p className="mt-1 text-xs text-mondy-muted">
                    Stripe&apos;s test reader: no device, no real money. Approve or decline from the pickup screen.
                  </p>
                )}
                {reader.problem && <p className="mt-1 text-sm text-mondy-red-dark">{reader.problem}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.refresh()}
                disabled={pending}
                className={`flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream disabled:opacity-50 ${ring}`}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Check again
              </button>
              <button
                type="button"
                onClick={unpair}
                disabled={pending}
                className={`rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-mondy-red-dark ring-1 ring-mondy-border hover:bg-mondy-cream disabled:opacity-50 ${ring}`}
              >
                Remove reader
              </button>
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <h2 className="font-display text-lg font-black">Pair a reader</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-mondy-muted">
              <li>Turn the reader on and connect it to the restaurant Wi-Fi.</li>
              <li>
                On the reader, swipe right from the left edge, tap <b>Settings</b>, enter the admin passcode{" "}
                <b>07139</b>, then tap <b>Generate pairing code</b>.
              </li>
              <li>Type the code below.</li>
            </ol>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Pairing code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="sepia-cerulean-aqua" autoCapitalize="none" autoCorrect="off" className={field} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Name</span>
              <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className={field} />
            </label>

            {needsAddress && (
              <fieldset className="space-y-3">
                <legend className="mb-1.5 text-sm font-semibold">Restaurant address (Stripe needs it once)</legend>
                <input
                  aria-label="Street address"
                  placeholder="Street address"
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  className={field}
                />
                <div className="grid grid-cols-[1fr_80px_110px] gap-2">
                  <input aria-label="City" placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className={field} />
                  <input
                    aria-label="State"
                    placeholder="MA"
                    maxLength={2}
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                    className={field}
                  />
                  <input
                    aria-label="ZIP code"
                    placeholder="ZIP"
                    inputMode="numeric"
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    className={field}
                  />
                </div>
              </fieldset>
            )}

            <button
              type="button"
              onClick={() => pair(code, label)}
              disabled={pending}
              className={`w-full rounded-xl bg-mondy-red px-5 py-3 text-base font-semibold text-white hover:bg-mondy-red-dark disabled:opacity-60 ${ring}`}
            >
              {pending ? "Pairing…" : "Pair reader"}
            </button>

            {testMode && (
              <div className="rounded-xl bg-mondy-yellow-soft px-4 py-3 ring-1 ring-mondy-border">
                <p className="text-sm font-semibold">No reader yet?</p>
                <p className="mt-0.5 text-sm text-mondy-muted">
                  Stripe is in test mode, so you can try the whole flow with Stripe&apos;s simulated reader. No device,
                  no real money.
                </p>
                <button
                  type="button"
                  onClick={() => pair("simulated-wpe", "Test reader")}
                  disabled={pending}
                  className={`mt-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream disabled:opacity-60 ${ring}`}
                >
                  Use Stripe&apos;s test reader
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
