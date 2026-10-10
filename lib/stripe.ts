import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-side Stripe client. Throws a clear error if the key is missing. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  // Local testing only: STRIPE_FAKE_API_URL points the client at a fake Stripe
  // server. Ignored unless the key is a test key, so it can never touch live money.
  const fake = process.env.STRIPE_FAKE_API_URL;
  if (fake && key.startsWith("sk_test_")) {
    const u = new URL(fake);
    client = new Stripe(key, { host: u.hostname, port: Number(u.port), protocol: u.protocol === "https:" ? "https" : "http" });
    return client;
  }
  client = new Stripe(key);
  return client;
}

/** True when Stripe is in test mode (sk_test_…): no real money moves. */
export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
