"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarDays, Check, Mail, MessageSquare, Phone, RotateCcw, Star, Users, UtensilsCrossed } from "lucide-react";
import { setMessageHandled } from "@/app/messages/actions";
import { longDay } from "@/lib/announcement-display";

type Kind = "CONTACT" | "CATERING" | "FEEDBACK";
type Msg = {
  id: string;
  kind: Kind;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string;
  eventDate: string | null;
  guests: number | null;
  rating: number | null;
  orderCode: string | null;
  isHandled: boolean;
  handledBy: string | null;
  createdAt: string;
};

const KIND: Record<Kind, { label: string; icon: typeof Mail }> = {
  CATERING: { label: "Catering", icon: UtensilsCrossed },
  CONTACT: { label: "Contact", icon: MessageSquare },
  FEEDBACK: { label: "Feedback", icon: Star },
};

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";

export function MessagesBoard({ messages, timezone }: { messages: Msg[]; timezone: string }) {
  const router = useRouter();
  const [show, setShow] = useState<"new" | "handled">("new");
  const [kind, setKind] = useState<Kind | "ALL">("ALL");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const fresh = messages.filter((m) => !m.isHandled);
    return {
      new: fresh.length,
      handled: messages.length - fresh.length,
      ALL: fresh.length,
      CATERING: fresh.filter((m) => m.kind === "CATERING").length,
      CONTACT: fresh.filter((m) => m.kind === "CONTACT").length,
      FEEDBACK: fresh.filter((m) => m.kind === "FEEDBACK").length,
    };
  }, [messages]);

  const ratings = messages.filter((m) => m.rating).map((m) => m.rating!);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const list = messages.filter((m) => (show === "new" ? !m.isHandled : m.isHandled) && (kind === "ALL" || m.kind === kind));

  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  function toggle(m: Msg) {
    setError(null);
    setBusy(m.id);
    startTransition(async () => {
      const res = await setMessageHandled(m.id, !m.isHandled);
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const pill = (active: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${ring} ${
      active ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
    }`;

  return (
    <main className="min-h-screen bg-mondy-cream font-sans text-mondy-ink">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className={`flex w-fit items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border hover:bg-mondy-cream ${ring}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to register
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="font-display text-2xl font-black">Messages</h1>
              <p className="text-sm text-mondy-muted">Contact, catering and feedback sent from the online order page.</p>
            </div>
            {avg !== null && (
              <p className="flex items-center gap-1 rounded-full bg-mondy-cream px-3 py-1 text-sm font-semibold ring-1 ring-mondy-border">
                <Star className="h-4 w-4 fill-mondy-red text-mondy-red" aria-hidden />
                {avg.toFixed(1)} average from {ratings.length} review{ratings.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="Show" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
              <button type="button" aria-pressed={show === "new"} onClick={() => setShow("new")} className={pill(show === "new")}>
                New ({counts.new})
              </button>
              <button type="button" aria-pressed={show === "handled"} onClick={() => setShow("handled")} className={pill(show === "handled")}>
                Handled ({counts.handled})
              </button>
            </div>
            <div role="group" aria-label="Type" className="flex overflow-x-auto rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
              {(["ALL", "CATERING", "CONTACT", "FEEDBACK"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>
                  {k === "ALL" ? "All" : KIND[k].label}
                  {show === "new" && counts[k] > 0 ? ` (${counts[k]})` : ""}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-mondy-yellow px-3 py-2 text-sm text-mondy-red-dark">
              {error}
            </p>
          )}
        </div>
      </header>

      <ul className="mx-auto max-w-3xl space-y-3 px-4 py-5 sm:px-6">
        {list.length === 0 && (
          <li className="py-16 text-center text-sm text-mondy-muted">
            {show === "new" ? "No new messages. All caught up." : "Nothing handled yet."}
          </li>
        )}
        {list.map((m) => {
          const K = KIND[m.kind];
          return (
            <li key={m.id} className={`rounded-2xl bg-white p-4 ring-1 ${m.kind === "CATERING" && !m.isHandled ? "ring-2 ring-mondy-red/40" : "ring-mondy-border"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-mondy-red">
                  <K.icon className="h-3.5 w-3.5" aria-hidden />
                  {K.label}
                </p>
                <p className="text-xs text-mondy-muted">{when(m.createdAt)}</p>
              </div>

              <p className="mt-1 font-display text-lg font-black">{m.name || "Anonymous"}</p>

              {m.kind === "FEEDBACK" && m.rating && (
                <p className="mt-0.5 flex items-center gap-0.5" aria-label={`${m.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`h-4 w-4 ${n <= m.rating! ? "fill-mondy-red text-mondy-red" : "text-mondy-border"}`} aria-hidden />
                  ))}
                  {m.orderCode && <span className="ml-2 text-xs font-semibold tabular text-mondy-muted">Order {m.orderCode}</span>}
                </p>
              )}

              {m.kind === "CATERING" && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                  {m.eventDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-mondy-muted" aria-hidden />
                      {longDay(m.eventDate)}
                    </span>
                  )}
                  {m.guests && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-mondy-muted" aria-hidden />
                      {m.guests} people
                    </span>
                  )}
                </p>
              )}

              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{m.message}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {m.phone && (
                  <a href={`tel:${m.phone}`} className={`flex items-center gap-1.5 rounded-lg bg-mondy-cream px-3 py-2 text-xs font-semibold ring-1 ring-mondy-border hover:bg-white ${ring}`}>
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {m.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                  </a>
                )}
                {m.email && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(m.kind === "CATERING" ? "Your catering request – Rosewood Cafe" : "Rosewood Cafe")}`}
                    className={`flex items-center gap-1.5 rounded-lg bg-mondy-cream px-3 py-2 text-xs font-semibold ring-1 ring-mondy-border hover:bg-white ${ring}`}
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {m.email}
                  </a>
                )}
                <button
                  type="button"
                  disabled={pending && busy === m.id}
                  onClick={() => toggle(m)}
                  className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${ring} ${
                    m.isHandled ? "ring-1 ring-mondy-border hover:bg-mondy-cream" : "bg-mondy-ink text-white hover:bg-black"
                  }`}
                >
                  {m.isHandled ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                  {m.isHandled ? "Mark as new" : "Mark handled"}
                </button>
              </div>
              {m.isHandled && m.handledBy && <p className="mt-2 text-xs text-mondy-muted">Handled by {m.handledBy}</p>}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
