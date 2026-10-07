/**
 * Signed session cookie.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))
 *
 * The signature uses SESSION_SECRET, which only the server knows. If anyone
 * edits the cookie (for example, changes "CASHIER" to "OWNER") or writes one
 * by hand, the signature no longer matches and the session is rejected.
 *
 * Uses Web Crypto so it works in both the proxy and server code.
 */

export const SESSION_COOKIE = "mondy_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours: never stay signed in longer than a shift

/**
 * Sign out after this many minutes with nobody touching the screen.
 * Set SESSION_IDLE_MINUTES in Vercel / .env to change it (1–60, default 5).
 */
export const IDLE_MINUTES = (() => {
  const n = Number(process.env.SESSION_IDLE_MINUTES);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? Math.round(n) : 5;
})();

/**
 * The server allows a little longer than the on-screen timer, because the
 * screen only checks in with the server about once a minute while in use.
 * Someone who bypasses the screen timer is still cut off at idle + 2 minutes.
 */
export const SESSION_IDLE_SECONDS = IDLE_MINUTES * 60 + 120;

export type SessionData = {
  staffId: string;
  name: string;
  role: string;
  hasOpenShift?: boolean;
  iat: number; // unix seconds: when they entered their PIN
  exp: number; // unix seconds: idle cut-off, pushed forward while they're active
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_IDLE_SECONDS,
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

/**
 * Sign a session. Pass `iat` to keep the original login time (when
 * refreshing); leave it out for a brand-new login.
 */
export async function signSession(
  data: Omit<SessionData, "exp" | "iat"> & { iat?: number },
  idleSeconds = SESSION_IDLE_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const iat = data.iat ?? now;
  const payload: SessionData = {
    ...data,
    iat,
    // Idle cut-off, but never past the 12-hour cap from login.
    exp: Math.min(now + idleSeconds, iat + SESSION_MAX_AGE),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Returns the session if the cookie is genuine and not expired, else null. */
export async function verifySession(raw: string | undefined | null): Promise<SessionData | null> {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot !== raw.lastIndexOf(".")) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  try {
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      fromBase64Url(sig),
      encoder.encode(body),
    );
    if (!ok) return null;

    const data = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionData;
    if (
      typeof data.staffId !== "string" ||
      typeof data.role !== "string" ||
      typeof data.exp !== "number" ||
      typeof data.iat !== "number" ||
      data.exp < Math.floor(Date.now() / 1000) ||
      data.iat + SESSION_MAX_AGE < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("SESSION_SECRET")) {
      console.error(e.message);
    }
    return null;
  }
}

/** Same session, idle timer restarted (login time and 12-hour cap unchanged). */
export function refreshSession(session: SessionData): Promise<string> {
  const { exp: _exp, ...rest } = session;
  void _exp;
  return signSession(rest);
}
