"use server";

import { checkUnsubscribeToken, optOut } from "@/lib/campaigns";

export async function unsubscribe(u: string, t: string): Promise<{ ok: boolean }> {
  if (typeof u !== "string" || typeof t !== "string" || !checkUnsubscribeToken(u, t)) return { ok: false };
  await optOut(u);
  return { ok: true };
}
