"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  checkSquarePairing,
  setSquareDeviceManually,
  startSquarePairing,
  unpairSquare,
  type TerminalTarget,
} from "@/app/admin/square/actions";

export type SquareTerminalInfo = { enabled: boolean; sandbox: boolean; problem: string | null; deviceId: string | null; deviceName: string | null };

/** Pair (or unpair) a Square Terminal for the register or the self-checkout. */
export function SquareTerminalCard({
  square,
  target,
  title,
  intro,
}: {
  square: SquareTerminalInfo;
  target: TerminalTarget;
  title: string;
  intro?: string;
}) {
  const router = useRouter();
  const [pair, setPair] = useState<{ codeId: string; code: string } | null>(null);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!pair) return;
    const t = setInterval(async () => {
      const r = await checkSquarePairing(pair.codeId, target);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (r.paired) {
        setPair(null);
        setMsg({ ok: true, text: "Square Terminal paired" });
        router.refresh();
      } else if (r.expired) {
        setPair(null);
        setMsg({ ok: false, text: "The code expired. Get a new code." });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pair, router, target]);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border" aria-labelledby={`sq-${target}`}>
      <h2 id={`sq-${target}`} className="font-display text-lg font-bold">
        {title}
      </h2>
      {intro && <p className="mt-1 text-sm text-mondy-muted">{intro}</p>}
      {!square.enabled ? (
        <p className="mt-1 text-sm">
          Not set up: {square.problem}. In Vercel, add <code>SQUARE_ACCESS_TOKEN</code>, <code>SQUARE_LOCATION_ID</code> and{" "}
          <code>SQUARE_ENVIRONMENT</code> (<code>production</code> or <code>sandbox</code>) from the Square Developer Console, then redeploy.
        </p>
      ) : square.deviceId ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
            <span>
              Paired: <strong>{square.deviceName ?? "Square Terminal"}</strong> <span className="text-mondy-muted">({square.deviceId})</span>
              {square.sandbox && " · sandbox (test)"}
            </span>
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await unpairSquare(target); router.refresh(); })}
            className="min-h-11 rounded-lg px-3 font-semibold text-mondy-red-dark ring-1 ring-mondy-border"
          >
            Unpair
          </button>
        </div>
      ) : square.sandbox ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await setSquareDeviceManually(manual, target);
              setMsg(r.ok ? { ok: true, text: "Test device saved" } : { ok: false, text: r.error });
              router.refresh();
            });
          }}
        >
          <label className="min-w-0 flex-1 text-sm font-medium">
            Sandbox test device id (Square&apos;s docs list them)
            <input value={manual} name={`device-${target}`} onChange={(e) => setManual(e.target.value)} className="mt-1 block h-11 w-full rounded-lg px-3 ring-1 ring-mondy-border" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white">
            Save
          </button>
        </form>
      ) : pair ? (
        <div className="mt-2 text-sm">
          <p>On the Square Terminal: sign in → Device code, and enter:</p>
          <p className="mt-2 font-mono text-3xl font-black tracking-widest" aria-live="polite">
            {pair.code}
          </p>
          <p className="mt-1 text-mondy-muted">Waiting for the Terminal… (the code works for 5 minutes)</p>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              const r = await startSquarePairing(target);
              if (r.ok) setPair({ codeId: r.codeId, code: r.code });
              else setMsg({ ok: false, text: r.error });
            })
          }
          className="mt-2 min-h-11 rounded-lg bg-mondy-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Pair a Square Terminal
        </button>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-mondy-red-dark"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
