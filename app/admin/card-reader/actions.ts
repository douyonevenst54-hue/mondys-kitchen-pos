"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getManagerFromSession } from "@/lib/staff";
import { ReaderError, pairReader, unpairReader } from "@/lib/terminal";
import { stripeTestMode } from "@/lib/stripe";

type Result = { ok: true } | { ok: false; error: string };

const PairSchema = z.object({
  code: z.string().trim().min(3, "Enter the code shown on the reader").max(64),
  label: z.string().trim().min(1, "Give the reader a name").max(40),
  address: z
    .object({
      line1: z.string().trim().min(3, "Enter the street address").max(120),
      city: z.string().trim().min(2, "Enter the city").max(60),
      state: z.string().trim().regex(/^[A-Za-z]{2}$/, "Use the 2-letter state, like MA").transform((s) => s.toUpperCase()),
      postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
    })
    .nullable(),
});

export async function pairCardReader(input: z.input<typeof PairSchema>): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can pair a reader" };
  const p = PairSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form" };
  if (p.data.code.startsWith("simulated-") && !stripeTestMode()) {
    return { ok: false, error: "The test reader only works while Stripe is in test mode" };
  }
  try {
    await pairReader(p.data.code, p.data.label, p.data.address);
    revalidatePath("/admin/card-reader");
    revalidatePath("/online");
    return { ok: true };
  } catch (e) {
    if (e instanceof ReaderError) return { ok: false, error: e.message };
    console.error("Pair reader failed:", e);
    return { ok: false, error: "Couldn't reach Stripe. Check the Stripe keys and try again." };
  }
}

export async function unpairCardReader(): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can change the reader" };
  await unpairReader();
  revalidatePath("/admin/card-reader");
  revalidatePath("/online");
  return { ok: true };
}
