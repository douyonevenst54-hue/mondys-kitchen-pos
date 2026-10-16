"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bell, BellOff, Check, Clock, Maximize, RotateCcw } from "lucide-react";
import { bump, recall, refreshKitchen, start, toggleItem } from "@/app/kitchen/actions";
import type { KitchenBoard, KitchenTicket } from "@/lib/kitchen";

const POLL_MS = 5_000;
const WARN_MIN = 10; // amber after this many minutes
const LATE_MIN = 15; // red after this many minutes

/** Short two-tone chime for a new ticket (Web Audio, no sound file to load). */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.4);
  });
}

export function KitchenDisplay({
  initial,
  timezone,
}: {
  initial: KitchenBoard;
  timezone: string;
}) {
  const [board, setBoard] = useState(initial);
  const [now, setNow] = useState(() => new Date(initial.serverNow).getTime());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const known = useRef(new Set(initial.tickets.map((t) => t.id)));
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);

  const apply = useCallback((next: KitchenBoard) => {
    const added = next.tickets.filter((t) => !known.current.has(t.id)).map((t) => t.id);
    next.tickets.forEach((t) => known.current.add(t.id));
    if (added.length) {
      setFresh((s) => new Set([...s, ...added]));
      if (soundRef.current && audio.current) chime(audio.current);
      setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.includes(id)))), 20_000);
    }
    setBoard(next);
  }, []);

  // Keep the screen fresh and the timers ticking.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const r = await refreshKitchen();
        if (r.ok) {
          apply(r.board);
          setError(null);
        } else setError(r.error);
      } catch {
        setError("No connection. Tickets will update when it's back.");
      }
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [apply]);

  function act(fn: () => ReturnType<typeof bump>, done?: string) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          apply(r.board);
          setError(null);
          if (done) {
            setNotice(done);
            setTimeout(() => setNotice(null), 4_000);
          }
        } else setError(r.error);
      } catch {
        setError("No connection. Tap again when it's back.");
      }
    });
  }

  function toggleSound() {
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = new Ctx();
    }
    const next = !soundRef.current;
    soundRef.current = next;
    setSound(next);
    if (next) chime(audio.current);
  }

  const clock = (iso: string | number) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));

  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/80 ring-1 ring-white/20 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Register
          </Link>
          <h1 className="mr-auto text-2xl font-black tracking-tight">
            Kitchen <span className="ml-1 text-base font-semibold text-white/70">{board.tickets.length} open</span>
          </h1>
          {board.upcoming.count > 0 && board.upcoming.next && (
            <p className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm">
              <Clock className="h-4 w-4" aria-hidden />
              {board.upcoming.count} scheduled later · next {clock(board.upcoming.next)}
            </p>
          )}
          {board.recall && (
            <button
              type="button"
              onClick={() => act(() => recall(board.recall!.id), `${board.recall!.label} is back on the screen`)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm ring-1 ring-white/20 hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Recall {board.recall.label}
            </button>
          )}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm ring-1 ${
              sound ? "bg-emerald-600 ring-emerald-500" : "ring-white/20 hover:bg-white/10"
            }`}
          >
            {sound ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            {sound ? "Sound on" : "Turn sound on"}
          </button>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
            className="grid h-11 w-11 place-items-center rounded-xl ring-1 ring-white/20 hover:bg-white/10"
            aria-label="Full screen"
          >
            <Maximize className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-full text-right text-sm tabular-nums text-white/70 sm:w-auto" aria-label="Current time">
            {clock(now)}
          </span>
        </div>
        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            className={`px-4 py-2 text-sm font-semibold ${error ? "bg-red-700" : "bg-emerald-700"}`}
          >
            {error ?? notice}
          </p>
        )}
      </header>

      {board.tickets.length === 0 ? (
        <main className="grid min-h-[70vh] place-items-center px-4 text-center">
          <div>
            <p className="text-3xl font-black">All caught up</p>
            <p className="mt-2 text-white/70">New register and online orders show up here by themselves.</p>
          </div>
        </main>
      ) : (
        <main className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {board.tickets.map((t) => (
            <Ticket
              key={t.id}
              t={t}
              now={now}
              isNew={fresh.has(t.id)}
              clock={clock}
              onItem={(id) => act(() => toggleItem(id))}
              onStart={() => act(() => start(t.id))}
              onDone={() =>
                act(
                  () => bump(t.id),
                  t.source === "online" ? `${t.label} done. The customer now sees "ready for pickup".` : `${t.label} done`,
                )
              }
            />
          ))}
        </main>
      )}
    </div>
  );
}

function Ticket({
  t,
  now,
  isNew,
  clock,
  onItem,
  onStart,
  onDone,
}: {
  t: KitchenTicket;
  now: number;
  isNew: boolean;
  clock: (iso: string) => string;
  onItem: (id: string) => void;
  onStart: () => void;
  onDone: () => void;
}) {
  const age = Math.max(0, Math.floor((now - new Date(t.receivedAt).getTime()) / 60_000));
  // Lateness: against the promised time when there is one, else against age.
  const minsToDue = t.dueAt ? Math.round((new Date(t.dueAt).getTime() - now) / 60_000) : null;
  const level =
    minsToDue !== null
      ? minsToDue < 0
        ? "late"
        : minsToDue <= 5
          ? "warn"
          : "ok"
      : age >= LATE_MIN
        ? "late"
        : age >= WARN_MIN
          ? "warn"
          : "ok";
  const bar = { ok: "bg-emerald-800 text-white", warn: "bg-amber-400 text-black", late: "bg-red-700 text-white" }[level];
  const left = t.items.filter((i) => !i.done).length;

  return (
    <article
      aria-label={`Order ${t.label}`}
      className={`flex flex-col overflow-hidden rounded-2xl bg-white text-neutral-950 ${isNew ? "ring-4 ring-sky-400" : ""}`}
    >
      <header className={`px-4 py-2.5 ${bar}`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-2xl font-black tabular-nums">{t.label}</h2>
          <span className="text-lg font-bold tabular-nums">
            {minsToDue !== null
              ? minsToDue < 0
                ? `${-minsToDue} min late`
                : `due ${clock(t.dueAt!)}`
              : `${age} min`}
          </span>
        </div>
        <p className="text-sm font-semibold">
          {t.type}
          {t.table ? ` · ${t.table}` : ""}
          {t.customerName ? ` · ${t.customerName}` : ""}
          {t.scheduled ? " · scheduled" : ""}
          {isNew ? " · NEW" : ""}
        </p>
      </header>

      {t.notes && <p className="bg-yellow-200 px-4 py-2 text-base font-bold">⚠ {t.notes}</p>}

      <ul className="flex-1 divide-y divide-neutral-200">
        {t.items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onItem(i.id)}
              aria-pressed={i.done}
              className={`flex min-h-12 w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-100 focus:outline-none focus-visible:bg-sky-100 ${
                i.done ? "text-neutral-500" : ""
              }`}
            >
              <span className="w-8 shrink-0 text-xl font-black tabular-nums">{i.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-lg font-bold leading-snug ${i.done ? "line-through" : ""}`}>{i.name}</span>
                {i.notes && <span className="block text-base leading-snug text-neutral-700">{i.notes}</span>}
              </span>
              {i.done && <Check className="mt-1 h-5 w-5 shrink-0 text-emerald-700" aria-label="done" />}
            </button>
          </li>
        ))}
      </ul>

      <footer className="flex gap-2 border-t border-neutral-200 p-2">
        {!t.started && (
          <button
            type="button"
            onClick={onStart}
            className="min-h-14 flex-1 rounded-xl bg-neutral-200 px-3 text-base font-bold hover:bg-neutral-300"
          >
            Start
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="min-h-14 flex-[2] rounded-xl bg-neutral-950 px-3 text-base font-bold text-white hover:bg-black"
        >
          {t.source === "online" ? "Done · ready for pickup" : "Done"}
          {left > 0 && left < t.items.length ? ` (${left} left)` : ""}
        </button>
      </footer>
    </article>
  );
}
