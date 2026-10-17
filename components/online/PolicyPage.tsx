import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Shared layout for the Privacy and Terms pages (readable, phone-first). */
export function PolicyPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-mondy-cream px-5 py-8 text-mondy-ink">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-mondy-border sm:p-8">
        <Link href="/order" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-mondy-red-dark">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the menu
        </Link>
        <h1 className="mt-2 font-display text-3xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-mondy-muted">Last updated {updated}</p>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-black [&_li]:ml-5 [&_li]:list-disc [&_a]:font-semibold [&_a]:text-mondy-red-dark [&_a]:underline">
          {children}
        </div>
      </article>
    </main>
  );
}

/** Bump when the wording changes. */
export const POLICY_UPDATED = "October 16, 2026";
