import { cookies } from "next/headers";
import { SESSION_COOKIE, refreshSession, sessionCookieOptions, verifySession } from "@/lib/session";

/**
 * GET: the screen checking in because someone is using it. This is the ONLY
 * place the idle cut-off moves forward, so page loads, link prefetches and
 * background polling never keep an unattended screen signed in.
 */
export async function GET() {
  const c = await cookies();
  const session = await verifySession(c.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  c.set(SESSION_COOKIE, await refreshSession(session), sessionCookieOptions());
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE: sign out (used by the idle timer). */
export async function DELETE() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
