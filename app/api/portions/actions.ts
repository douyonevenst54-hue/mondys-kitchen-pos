"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getManagerFromSession } from "@/lib/staff";
import {
  PortionError,
  recordAdd,
  recordCount,
  recordRemove,
} from "@/lib/portions";

export type PortionActionResult =
  | { ok: true; itemId: string; portionsLeft: number }
  | { ok: false; error: string };

const Qty = z.number().int().min(0).max(9999);

const InputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count"), itemId: z.string().min(1), quantity: Qty }),
  z.object({
    kind: z.literal("add"),
    itemId: z.string().min(1),
    quantity: Qty.min(1, "Enter at least 1"),
  }),
  z.object({
    kind: z.literal("remove"),
    itemId: z.string().min(1),
    quantity: Qty.min(1, "Enter at least 1"),
    reason: z.string().trim().min(3, "Say why (at least 3 characters)").max(120),
  }),
]);

export type PortionActionInput = z.input<typeof InputSchema>;

export async function changePortions(
  input: PortionActionInput,
): Promise<PortionActionResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry" };
  }

  const manager = await getManagerFromSession();
  if (!manager) {
    return { ok: false, error: "Only an owner or manager can change counts" };
  }

  const data = parsed.data;
  try {
    const portionsLeft =
      data.kind === "count"
        ? await recordCount(data.itemId, data.quantity, manager.id)
        : data.kind === "add"
          ? await recordAdd(data.itemId, data.quantity, manager.id)
          : await recordRemove(data.itemId, data.quantity, data.reason, manager.id);

    revalidatePath("/");
    revalidatePath("/menu/portions");
    revalidatePath("/menu/availability");
    revalidatePath("/reports/portions");

    return { ok: true, itemId: data.itemId, portionsLeft };
  } catch (e) {
    if (e instanceof PortionError) return { ok: false, error: e.message };
    console.error("Portion change failed:", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}
