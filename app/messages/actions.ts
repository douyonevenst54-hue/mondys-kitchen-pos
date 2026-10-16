"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";

type Result = { ok: true } | { ok: false; error: string };

/** Mark a customer message handled (or back to new). */
export async function setMessageHandled(id: string, handled: boolean): Promise<Result> {
  const p = z.object({ id: z.string().min(1).max(64), handled: z.boolean() }).safeParse({ id, handled });
  if (!p.success) return { ok: false, error: "Invalid request" };
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can update messages" };
  await prisma.customerMessage.update({
    where: { id: p.data.id },
    data: p.data.handled
      ? { isHandled: true, handledBy: manager.name, handledAt: new Date() }
      : { isHandled: false, handledBy: null, handledAt: null },
  });
  revalidatePath("/messages");
  return { ok: true };
}
