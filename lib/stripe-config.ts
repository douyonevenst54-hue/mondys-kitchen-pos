import "server-only";

/**
 * Whether online card payments can work, read when the page loads (not baked
 * in at build time), so adding a key in Vercel takes effect on the next
 * deploy without needing a cache-free rebuild.
 */

// Built from parts so the bundler never swaps it for a build-time value.
const PUBLIC_NAME = ["NEXT", "PUBLIC", "STRIPE", "PUBLISHABLE", "KEY"].join("_");
const ALT_NAME = ["STRIPE", "PUBLISHABLE", "KEY"].join("_");
const SECRET_NAME = ["STRIPE", "SECRET", "KEY"].join("_");
const HOOK_NAME = ["STRIPE", "WEBHOOK", "SECRET"].join("_");

const read = (name: string) => (process.env[name] ?? "").trim();

export type CardStatus =
  | { enabled: true; publishableKey: string; mode: "test" | "live" }
  | { enabled: false; publishableKey: null; problem: string };

export function getCardStatus(): CardStatus {
  const pk = read(PUBLIC_NAME) || read(ALT_NAME);
  const sk = read(SECRET_NAME);
  const off = (problem: string): CardStatus => ({ enabled: false, publishableKey: null, problem });

  if (!pk) return off(`${PUBLIC_NAME} is missing for this deployment`);
  if (!/^pk_(test|live)_/.test(pk)) return off(`${PUBLIC_NAME} should start with pk_test_ or pk_live_`);
  if (!sk) return off(`${SECRET_NAME} is missing for this deployment`);
  if (!/^(sk|rk)_(test|live)_/.test(sk)) return off(`${SECRET_NAME} should start with sk_test_ or sk_live_`);

  const pkMode = pk.includes("_live_") ? "live" : "test";
  const skMode = sk.includes("_live_") ? "live" : "test";
  if (pkMode !== skMode) return off(`The publishable key is ${pkMode} but the secret key is ${skMode}; both must match`);

  return { enabled: true, publishableKey: pk, mode: pkMode };
}

/** Webhook secret check, for the settings screen only. */
export function webhookConfigured(): boolean {
  return read(HOOK_NAME).startsWith("whsec_");
}
