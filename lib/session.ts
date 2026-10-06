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
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours: a full shift

export type SessionData = {
  staffId: string;
  name: string;
  role: string;
  hasOpenShift?: boolean;
  exp: number; // unix seconds
};

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

export async function signSession(
  data: Omit<SessionData, "exp">,
  maxAgeSeconds = SESSION_MAX_AGE,
): Promise<string> {
  const payload: SessionData = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
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
      data.exp < Math.floor(Date.now() / 1000)
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
