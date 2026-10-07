"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

/** Pages with no signed-in staff: no timer at all. */
const NO_TIMER = ["/login", "/order"];

/**
 * Screens meant to sit untouched (the online-orders queue on the counter
 * tablet). They never time out, and they keep checking in so new orders keep
 * arriving. Leaving the queue starts the normal timer.
 */
const DISPLAY_SCREENS = ["/online"];

const WARN_SECONDS = 30;
const CHECK_IN_WHILE_ACTIVE_MS = 60_000;
const CHECK_IN_DISPLAY_MS = 120_000;
const SHARED_KEY = "mondy_last_activity"; // keeps several open tabs in step

const matches = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(p + "/"));

export function IdleLogout({ idleMinutes }: { idleMinutes: number }) {
  const pathname = usePathname() ?? "/";
  const off = matches(pathname, NO_TIMER);
  const display = matches(pathname, DISPLAY_SCREENS);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastCheckIn = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    if (off) return;

    const idleMs = idleMinutes * 60_000;
    const start = Date.now();
    lastActivity.current = start; // opening a page counts as activity
    lastCheckIn.current = 0; // so check in with the server on the first tick
    let lastSharedWrite = 0;

    function readShared() {
      try {
        const v = Number(localStorage.getItem(SHARED_KEY));
        if (Number.isFinite(v) && v > lastActivity.current && v <= Date.now()) lastActivity.current = v;
      } catch {
        // Storage blocked: this tab keeps its own timer.
      }
    }

    function onActivity() {
      const now = Date.now();
      lastActivity.current = now;
      setSecondsLeft(null);
      if (now - lastSharedWrite > 5_000) {
        lastSharedWrite = now;
        try {
          localStorage.setItem(SHARED_KEY, String(now));
        } catch {
          // ignore
        }
      }
    }

    function goToLogin(reason?: string) {
      if (leaving.current) return;
      leaving.current = true;
      window.location.href = reason ? `/login?reason=${reason}` : "/login";
    }

    async function checkIn() {
      lastCheckIn.current = Date.now();
      try {
        const r = await fetch("/api/session", { cache: "no-store", redirect: "manual" });
        if (r.type === "opaqueredirect" || r.status === 401) goToLogin();
      } catch {
        // Offline for a moment; try again next round.
      }
    }

    async function signOut() {
      if (leaving.current) return;
      try {
        await fetch("/api/session", { method: "DELETE", cache: "no-store" });
      } catch {
        // The server cut-off still applies a couple of minutes later.
      }
      goToLogin("idle");
    }

    function tick() {
      if (leaving.current) return;
      readShared();
      const now = Date.now();

      if (display) {
        if (now - lastCheckIn.current >= CHECK_IN_DISPLAY_MS) void checkIn();
        return;
      }

      const idle = now - lastActivity.current;
      if (idle >= idleMs) {
        void signOut();
        return;
      }
      const left = Math.ceil((idleMs - idle) / 1000);
      setSecondsLeft(left <= WARN_SECONDS ? left : null);

      // While someone is working, check in about once a minute so the server
      // keeps the session alive (building a cart makes no other requests).
      if (lastActivity.current > lastCheckIn.current && now - lastCheckIn.current >= CHECK_IN_WHILE_ACTIVE_MS) {
        void checkIn();
      }
    }

    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") tick(); // tablet woke up
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(tick, 1_000);

    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      setSecondsLeft(null);
    };
  }, [off, display, idleMinutes]);

  if (off || display || secondsLeft === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      aria-describedby="idle-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-mondy-ink/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mondy-cream text-mondy-red">
          <Lock className="h-6 w-6" />
        </span>
        <h2 id="idle-title" className="mt-3 font-display text-2xl font-black text-mondy-ink">
          Still there?
        </h2>
        <p id="idle-desc" className="mt-1 font-sans text-sm text-mondy-muted">
          To keep the register safe, you&apos;ll be signed out in{" "}
          <span className="font-semibold tabular text-mondy-ink">{secondsLeft}</span>{" "}
          {secondsLeft === 1 ? "second" : "seconds"}.
        </p>
        <button
          type="button"
          autoFocus
          className="mt-5 w-full rounded-2xl bg-mondy-red px-5 py-4 font-sans text-base font-semibold text-white transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
        >
          I&apos;m still here
        </button>
      </div>
    </div>
  );
}
