"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ClubCard, type ClubCardPost } from "@/components/club/ClubCard";

export type ClubPost = ClubCardPost & { id: string };

const FIRST = 2;

/** "PS Club" corner on the order page. Renders nothing when there are no posts. */
export function ClubCorner({ posts }: { posts: ClubPost[] }) {
  const [all, setAll] = useState(false);
  if (posts.length === 0) return null;
  const shown = all ? posts : posts.slice(0, FIRST);
  const more = posts.length - FIRST;

  return (
    <section
      id="ps-club"
      aria-labelledby="ps-club-title"
      className="mt-6 scroll-mt-20 rounded-2xl bg-mondy-yellow-deep/60 px-4 pb-4 pt-5 ring-1 ring-mondy-border sm:px-5"
    >
      <div className="mb-4 text-center">
        <h2 id="ps-club-title" className="font-display text-xl font-black uppercase tracking-wide text-mondy-red">
          PS Club
        </h2>
        <p className="text-sm italic text-mondy-muted">Passport Special Club · draws, winners &amp; news</p>
      </div>
      <div className="space-y-3">
        {shown.map((p) => (
          <ClubCard key={p.id} post={p} />
        ))}
      </div>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mx-auto mt-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-mondy-red transition hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50"
        >
          {all ? "Show less" : `See ${more} more`}
          <ChevronDown className={`h-4 w-4 transition ${all ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </section>
  );
}
