"use client";

import { useState, useTransition } from "react";
import { unsubscribe } from "@/app/order/unsubscribe/actions";

export function UnsubscribeButton({ u, t }: { u: string; t: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  if (done) {
    return (
      <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">
        Done. You won&apos;t get emails about specials anymore.
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setDone((await unsubscribe(u, t)).ok))}
        className="mt-5 min-h-12 w-full rounded-2xl bg-mondy-ink px-5 font-semibold text-white hover:bg-black disabled:opacity-60"
      >
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      {done === false && (
        <p role="alert" className="mt-3 text-sm text-mondy-red-dark">
          That didn&apos;t work. Please call us and we&apos;ll take you off the list.
        </p>
      )}
    </>
  );
}
