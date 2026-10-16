import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/** The visitor's IP (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Allow `limit` hits per `windowMinutes` for a key (e.g. "rw:203.0.113.7").
 * Returns false once the limit is reached. Uses the LoginThrottle table.
 */
export async function allowHit(key: string, limit: number, windowMinutes: number): Promise<boolean> {
  const t = await prisma.loginThrottle.findUnique({ where: { key } });
  const fresh = !t || Date.now() - t.updatedAt.getTime() > windowMinutes * 60_000;
  if (!fresh && t && t.failures >= limit) return false;
  await prisma.loginThrottle.upsert({
    where: { key },
    update: { failures: fresh ? 1 : { increment: 1 } },
    create: { key, failures: 1 },
  });
  return true;
}
