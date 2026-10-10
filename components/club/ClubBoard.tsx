"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Eye, EyeOff, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { deletePost, savePost, setPostPinned, setPostPublished, type ClubResult } from "@/app/club/actions";
import { ClubCard } from "@/components/club/ClubCard";
import { shortDay } from "@/lib/announcement-display";

type Kind = "DRAW" | "WINNER" | "NEWS";

type Post = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  eventDate: string | null;
  isPinned: boolean;
  showFrom: string;
  showUntil: string | null;
  isPublished: boolean;
  status: "live" | "scheduled" | "ended" | "hidden";
  createdBy: string | null;
};

type Draft = {
  id?: string;
  kind: Kind;
  title: string;
  body: string;
  eventDate: string;
  showFrom: string;
  showUntil: string;
  isPinned: boolean;
  isPublished: boolean;
};

const EXAMPLES: Record<Kind, { title: string; body: string }> = {
  DRAW: {
    title: "Win 2 free dishes!",
    body: "Every order this week enters you in our PS Club draw. We'll pick one family and announce the winner right here.",
  },
  WINNER: {
    title: "Congratulations to the Joseph family!",
    body: "They won 2 dishes in this week's PS Club draw. Thank you to everyone who entered — next draw coming soon!",
  },
  NEWS: {
    title: "A new Passport Special this week",
    body: "Our chef is bringing a new flavor from around the world. Come taste it before it's gone!",
  },
};

const KIND_TABS: { value: Kind; label: string }[] = [
  { value: "DRAW", label: "Draw" },
  { value: "WINNER", label: "Winner" },
  { value: "NEWS", label: "News" },
];

const STATUS: Record<Post["status"], { label: string; cls: string }> = {
  live: { label: "On the order page", cls: "bg-green-100 text-green-800" },
  scheduled: { label: "Scheduled", cls: "bg-mondy-yellow text-mondy-ink" },
  ended: { label: "Ended", cls: "bg-mondy-cream text-mondy-muted ring-1 ring-mondy-border" },
  hidden: { label: "Hidden", cls: "bg-mondy-cream text-mondy-muted ring-1 ring-mondy-border" },
};

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";
const field =
  "w-full rounded-xl bg-mondy-cream px-3 py-2.5 text-base ring-1 ring-mondy-border placeholder:text-mondy-muted/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/50";

function blank(today: string): Draft {
  return { kind: "DRAW", title: "", body: "", eventDate: "", showFrom: today, showUntil: "", isPinned: false, isPublished: true };
}

export function ClubBoard({ posts, today }: { posts: Post[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = posts.filter((p) => p.status === "live" || p.status === "scheduled");
  const past = posts.filter((p) => p.status === "ended" || p.status === "hidden");

  function run(action: () => Promise<ClubResult>, done: string, after?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        after?.();
        setNotice(done);
        router.refresh();
      } catch {
        setError("Couldn't save. Check the connection and try again.");
      }
    });
  }

  function edit(p: Post) {
    setError(null);
    setNotice(null);
    setDraft({
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body,
      eventDate: p.eventDate ?? "",
      showFrom: p.showFrom,
      showUntil: p.showUntil ?? "",
      isPinned: p.isPinned,
      isPublished: p.isPublished,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    if (!draft) return;
    run(
      () =>
        savePost({
          id: draft.id,
          kind: draft.kind,
          title: draft.title,
          body: draft.body,
          eventDate: draft.kind === "DRAW" && draft.eventDate ? draft.eventDate : null,
          showFrom: draft.showFrom,
          showUntil: draft.showUntil || null,
          isPinned: draft.isPinned,
          isPublished: draft.isPublished,
        }),
      draft.id ? "Post updated." : draft.isPublished ? "Posted. Customers can see it now." : "Saved as hidden.",
      () => setDraft(null),
    );
  }

  return (
    <main className="min-h-screen bg-mondy-cream font-sans text-mondy-ink">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to register
            </Link>
            {!draft && (
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  setDraft(blank(today));
                }}
                className={`flex items-center gap-1.5 rounded-lg bg-mondy-red px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-mondy-red-dark ${ring}`}
              >
                <Plus className="h-4 w-4" aria-hidden />
                New post
              </button>
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl font-black">PS Club</h1>
            <p className="mt-0.5 text-sm text-mondy-muted">
              Passport Special Club corner on the online order page. Announce giveaway draws, winners and anything that
              matters to your customers.
            </p>
          </div>
          <div aria-live="polite">
            {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">{notice}</p>}
            {error && !draft && (
              <p role="alert" className="rounded-lg bg-mondy-yellow px-3 py-2 text-sm font-medium text-mondy-red-dark">
                {error}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5 sm:px-6">
        {draft && (
          <Editor
            draft={draft}
            today={today}
            pending={pending}
            error={error}
            onChange={setDraft}
            onCancel={() => {
              setDraft(null);
              setError(null);
            }}
            onSave={save}
          />
        )}

        <Section title="Current posts" empty="Nothing on the order page right now. Tap New post to add one.">
          {current.map((p) => (
            <Row key={p.id} post={p} pending={pending} onEdit={() => edit(p)} run={run} />
          ))}
        </Section>

        {past.length > 0 && (
          <Section title="Ended and hidden" empty="">
            {past.map((p) => (
              <Row key={p.id} post={p} pending={pending} onEdit={() => edit(p)} run={run} />
            ))}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 border-b border-mondy-red pb-1.5 font-display text-base font-black uppercase tracking-wide text-mondy-red">
        {title}
      </h2>
      {children.length === 0 ? <p className="py-6 text-center text-sm text-mondy-muted">{empty}</p> : <ul className="space-y-3">{children}</ul>}
    </section>
  );
}

function Row({
  post,
  pending,
  onEdit,
  run,
}: {
  post: Post;
  pending: boolean;
  onEdit: () => void;
  run: (action: () => Promise<ClubResult>, done: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const s = STATUS[post.status];
  const when = post.showUntil
    ? `${shortDay(post.showFrom)} – ${shortDay(post.showUntil)}`
    : `From ${shortDay(post.showFrom)}, until you hide it`;
  const btn = `flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream disabled:opacity-50 ${ring}`;

  return (
    <li className="rounded-2xl bg-mondy-yellow-soft p-3 ring-1 ring-mondy-border">
      <ClubCard post={post} />
      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
        <span className="text-xs text-mondy-muted">
          {when}
          {post.createdBy && ` · by ${post.createdBy}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} disabled={pending} className={btn}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setPostPinned(post.id, !post.isPinned), post.isPinned ? "Unpinned." : "Pinned to the top.")}
            className={btn}
          >
            {post.isPinned ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
            {post.isPinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => setPostPublished(post.id, !post.isPublished),
                post.isPublished ? "Hidden from customers." : "Showing again.",
              )
            }
            className={btn}
          >
            {post.isPublished ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {post.isPublished ? "Hide" : "Show"}
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deletePost(post.id), "Post deleted.")}
                className={`flex items-center gap-1.5 rounded-lg bg-mondy-red px-3 py-2 text-xs font-semibold text-white transition hover:bg-mondy-red-dark disabled:opacity-50 ${ring}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete for good
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={btn}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={btn} aria-label={`Delete ${post.title}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Editor({
  draft,
  today,
  pending,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  today: string;
  pending: boolean;
  error: string | null;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const example = EXAMPLES[draft.kind];

  return (
    <section aria-label={draft.id ? "Edit post" : "New post"} className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
      <h2 className="font-display text-lg font-black">{draft.id ? "Edit post" : "New post"}</h2>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <p id="kind-label" className="mb-1.5 text-sm font-semibold">
              Type
            </p>
            <div role="radiogroup" aria-labelledby="kind-label" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
              {KIND_TABS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === k.value}
                  onClick={() => set({ kind: k.value })}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${ring} ${
                    draft.kind === k.value ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-semibold">
              Title <span className="font-normal text-mondy-muted tabular">{draft.title.length}/80</span>
            </span>
            <input
              value={draft.title}
              maxLength={80}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={example.title}
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-semibold">
              Message <span className="font-normal text-mondy-muted tabular">{draft.body.length}/600</span>
            </span>
            <textarea
              value={draft.body}
              maxLength={600}
              rows={4}
              onChange={(e) => set({ body: e.target.value })}
              placeholder={example.body}
              className={field}
            />
          </label>
          {!draft.title && !draft.body && (
            <button
              type="button"
              onClick={() => set({ title: example.title, body: example.body })}
              className={`-mt-2 text-sm font-semibold text-mondy-red underline underline-offset-2 hover:text-mondy-red-dark ${ring}`}
            >
              Start from the example
            </button>
          )}

          {draft.kind === "WINNER" && (
            <p className="rounded-xl bg-mondy-yellow px-3 py-2.5 text-sm text-mondy-ink">
              Ask the winner before posting, and use a family name or first name with last initial (&ldquo;Marie
              D.&rdquo;). Never post phone numbers or addresses.
            </p>
          )}

          {draft.kind === "DRAW" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Draw date</span>
              <input
                type="date"
                value={draft.eventDate}
                min={draft.id ? undefined : today}
                onChange={(e) =>
                  set({
                    eventDate: e.target.value,
                    // A draw post usually comes down after the draw.
                    showUntil: !draft.showUntil || draft.showUntil === draft.eventDate ? e.target.value : draft.showUntil,
                  })
                }
                className={field}
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Show from</span>
              <input type="date" value={draft.showFrom} onChange={(e) => set({ showFrom: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                Show until <span className="font-normal text-mondy-muted">(optional)</span>
              </span>
              <input
                type="date"
                value={draft.showUntil}
                min={draft.showFrom}
                onChange={(e) => set({ showUntil: e.target.value })}
                className={field}
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-mondy-muted">Leave &ldquo;Show until&rdquo; empty to keep it up until you hide it.</p>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={draft.isPinned}
                onChange={(e) => set({ isPinned: e.target.checked })}
                className="h-5 w-5 accent-mondy-red"
              />
              Pin to the top
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => set({ isPublished: e.target.checked })}
                className="h-5 w-5 accent-mondy-red"
              />
              Show on the order page
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">Customers will see</p>
          <div className="rounded-2xl bg-mondy-cream p-3 ring-1 ring-mondy-border">
            <ClubCard
              post={{
                kind: draft.kind,
                title: draft.title,
                body: draft.body,
                eventDate: draft.kind === "DRAW" && draft.eventDate ? draft.eventDate : null,
                isPinned: draft.isPinned,
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-mondy-yellow px-3 py-2 text-sm font-medium text-mondy-red-dark">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-xl bg-white px-4 py-2.5 text-sm font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className={`rounded-xl bg-mondy-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-mondy-red-dark disabled:opacity-60 ${ring}`}
        >
          {pending ? "Saving…" : draft.id ? "Save changes" : draft.isPublished ? "Post it" : "Save hidden"}
        </button>
      </div>
    </section>
  );
}
