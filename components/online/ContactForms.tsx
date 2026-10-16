"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, Mail, MapPin, Phone, Star } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { sendCustomerMessage, type MessageInput } from "@/app/order/contact/actions";

export type ContactTab = "CONTACT" | "CATERING" | "FEEDBACK";

const TABS: { value: ContactTab; label: string; intro: string }[] = [
  { value: "CONTACT", label: "Contact", intro: "A question for us? Send a message and we'll get back to you." },
  { value: "CATERING", label: "Catering", intro: "Planning a party, meeting or celebration? Tell us about it and we'll put together a menu and a quote." },
  { value: "FEEDBACK", label: "Feedback", intro: "How did we do? Your feedback helps our kitchen and team get better." },
];

const ring = "focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30";
const field =
  "w-full rounded-xl bg-white px-4 py-3 text-base text-mondy-ink ring-1 ring-mondy-border placeholder:text-mondy-muted/70 focus:outline-none focus:ring-2 focus:ring-mondy-red/50";

export function ContactForms({
  initialTab,
  orderCode,
  today,
  restaurant,
}: {
  initialTab: ContactTab;
  orderCode: string;
  today: string;
  restaurant: { name: string; phone: string | null; email: string | null; address: string | null };
}) {
  const [tab, setTab] = useState<ContactTab>(initialTab);
  const [sent, setSent] = useState<ContactTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guests, setGuests] = useState("");
  const [rating, setRating] = useState(0);
  const [code, setCode] = useState(orderCode);
  const [website, setWebsite] = useState("");

  function switchTo(t: ContactTab) {
    setTab(t);
    setSent(null);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const base = { name, phone, email, message, website };
    const input: MessageInput =
      tab === "CATERING"
        ? { ...base, kind: "CATERING", eventDate, guests: Number(guests) || 0 }
        : tab === "FEEDBACK"
          ? { ...base, kind: "FEEDBACK", rating, orderCode: code }
          : { ...base, kind: "CONTACT" };
    if (tab === "FEEDBACK" && rating === 0) {
      setError("Choose a rating from 1 to 5 stars");
      return;
    }
    startTransition(async () => {
      try {
        const res = await sendCustomerMessage(input);
        if (!res.ok) return setError(res.error);
        setSent(tab);
        setMessage("");
        setEventDate("");
        setGuests("");
        setRating(0);
      } catch {
        setError("Couldn't send. Check your connection and try again.");
      }
    });
  }

  const intro = TABS.find((t) => t.value === tab)!.intro;
  const needsContact = tab !== "FEEDBACK";

  return (
    <div className="min-h-screen bg-mondy-cream text-mondy-ink">
      <header className="px-5 pb-6 pt-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <Link href="/order" className={`mb-5 flex items-center gap-1.5 self-start text-sm font-semibold text-mondy-red hover:text-mondy-red-dark ${ring}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to the menu
          </Link>
          <Wordmark size="lg" />
          <span aria-hidden className="mt-5 h-px w-full bg-mondy-red" />
          <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-mondy-muted">
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="flex items-center gap-1.5 hover:text-mondy-ink">
                <Phone className="h-4 w-4" aria-hidden />
                {restaurant.phone}
              </a>
            )}
            {restaurant.email && (
              <a href={`mailto:${restaurant.email}`} className="flex items-center gap-1.5 hover:text-mondy-ink">
                <Mail className="h-4 w-4" aria-hidden />
                {restaurant.email}
              </a>
            )}
            {restaurant.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {restaurant.address}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-16">
        <div role="tablist" aria-label="What would you like to do?" className="flex rounded-2xl bg-white p-1 ring-1 ring-mondy-border">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => switchTo(t.value)}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${ring} ${
                tab === t.value ? "bg-mondy-red text-white" : "text-mondy-muted hover:text-mondy-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {sent === tab ? (
          <section className="mt-6 rounded-2xl bg-white px-6 py-8 text-center ring-1 ring-mondy-border" aria-live="polite">
            <CheckCircle2 className="mx-auto h-12 w-12 text-mondy-red" aria-hidden />
            <h1 className="mt-3 font-display text-2xl font-black">
              {tab === "FEEDBACK" ? "Thank you!" : "Message sent"}
            </h1>
            <p className="mt-1 text-mondy-muted">
              {tab === "FEEDBACK"
                ? "We read every comment. Mèsi anpil!"
                : tab === "CATERING"
                  ? "Thanks! We'll contact you soon to talk about your event."
                  : "Thanks! We'll get back to you as soon as we can."}
            </p>
            <Link href="/order" className={`mt-6 inline-block rounded-2xl bg-mondy-red px-6 py-3 font-semibold text-white hover:bg-mondy-red-dark ${ring}`}>
              Back to the menu
            </Link>
          </section>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <p className="text-mondy-muted">{intro}</p>

            {tab === "FEEDBACK" && (
              <fieldset>
                <legend className="mb-2 font-semibold">Your rating</legend>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      onClick={() => setRating(n)}
                      className={`rounded-lg p-1 ${ring}`}
                    >
                      <Star className={`h-9 w-9 ${n <= rating ? "fill-mondy-red text-mondy-red" : "text-mondy-border"}`} aria-hidden />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <label className="block">
              <span className="mb-1.5 block font-semibold">
                Your name {tab === "FEEDBACK" && <span className="font-normal text-mondy-muted">(optional)</span>}
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" className={field} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block font-semibold">
                  Phone {!needsContact && <span className="font-normal text-mondy-muted">(optional)</span>}
                </span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(978) 555-0123" className={field} />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-semibold">
                  Email <span className="font-normal text-mondy-muted">(optional)</span>
                </span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className={field} />
              </label>
            </div>
            {needsContact && <p className="-mt-2 text-xs text-mondy-muted">Leave a phone number or an email so we can reply.</p>}

            {tab === "CATERING" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block font-semibold">Event date</span>
                  <input type="date" min={today} value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={field} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-semibold">Number of people</span>
                  <input type="number" inputMode="numeric" min={5} max={2000} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="25" className={field} />
                </label>
              </div>
            )}

            {tab === "FEEDBACK" && (
              <label className="block">
                <span className="mb-1.5 block font-semibold">
                  Order code <span className="font-normal text-mondy-muted">(optional)</span>
                </span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9} placeholder="MK-123456" className={`${field} uppercase tabular`} />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block font-semibold">
                {tab === "CATERING" ? "About the event" : tab === "FEEDBACK" ? "Comments" : "Message"}
                {tab === "FEEDBACK" && <span className="font-normal text-mondy-muted"> (optional)</span>}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={tab === "CATERING" ? 1500 : 1000}
                placeholder={
                  tab === "CATERING"
                    ? "Type of event, dishes you'd like, pickup or delivery, budget…"
                    : tab === "FEEDBACK"
                      ? "What did you love? What could be better?"
                      : "How can we help?"
                }
                className={field}
              />
            </label>

            <label aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-mondy-red/10 px-4 py-3 text-sm text-mondy-red-dark">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={`w-full rounded-2xl bg-mondy-red px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark disabled:opacity-60 ${ring}`}
            >
              {pending ? "Sending…" : tab === "CATERING" ? "Request catering" : tab === "FEEDBACK" ? "Send feedback" : "Send message"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
