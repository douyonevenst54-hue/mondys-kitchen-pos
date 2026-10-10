import { CalendarDays, Gift, Megaphone, Pin, Trophy } from "lucide-react";
import { KIND_LABEL, longDay } from "@/lib/announcement-display";

export type ClubCardPost = {
  kind: "DRAW" | "WINNER" | "NEWS";
  title: string;
  body: string;
  eventDate: string | null;
  isPinned: boolean;
};

const ICON = { DRAW: Gift, WINNER: Trophy, NEWS: Megaphone } as const;

/** One PS Club post, as customers see it. */
export function ClubCard({ post }: { post: ClubCardPost }) {
  const Icon = ICON[post.kind];
  return (
    <article className="relative rounded-2xl bg-white px-5 py-4 text-left ring-1 ring-mondy-border">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-mondy-red">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {KIND_LABEL[post.kind]}
        {post.isPinned && (
          <span className="ml-auto flex items-center gap-1 font-semibold normal-case tracking-normal text-mondy-muted">
            <Pin className="h-3 w-3" aria-hidden />
            Pinned
          </span>
        )}
      </p>
      <h3 className="mt-1.5 font-display text-lg font-black leading-snug text-mondy-ink">
        {post.title || "Your title"}
      </h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-mondy-muted">{post.body || "Your message"}</p>
      {post.kind === "DRAW" && post.eventDate && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mondy-yellow px-3 py-1 text-xs font-semibold text-mondy-ink">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Draw on {longDay(post.eventDate)}
        </p>
      )}
    </article>
  );
}
