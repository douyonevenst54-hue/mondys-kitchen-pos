import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/menu";
import { checkUnsubscribeToken } from "@/lib/campaigns";
import { UnsubscribeButton } from "@/components/online/UnsubscribeButton";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

type Search = Promise<{ u?: string; t?: string }>;

export default async function UnsubscribePage({ searchParams }: { searchParams: Search }) {
  const { u = "", t = "" } = await searchParams;
  const settings = await getSettings();
  const valid = checkUnsubscribeToken(u, t);
  return (
    <main className="grid min-h-screen place-items-center bg-mondy-cream px-5 text-mondy-ink">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-mondy-border">
        <p className="text-sm uppercase tracking-[0.2em] text-mondy-red-dark">{settings.name}</p>
        {valid ? (
          <>
            <h1 className="mt-2 font-display text-2xl font-black">Stop emails about specials?</h1>
            <p className="mt-2 text-mondy-muted">
              You&apos;ll still get emails about orders you place. You can sign up again at checkout anytime.
            </p>
            <UnsubscribeButton u={u} t={t} />
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-2xl font-black">This link doesn&apos;t work</h1>
            <p className="mt-2 text-mondy-muted">
              It may be incomplete. Use the unsubscribe link in the email again{settings.phone ? `, or call us at ${settings.phone}` : ""}.
            </p>
          </>
        )}
        <Link href="/order" className="mt-6 inline-block text-sm font-semibold text-mondy-red-dark underline">
          Back to the menu
        </Link>
      </div>
    </main>
  );
}
