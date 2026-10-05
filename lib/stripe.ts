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
  client = new Stripe(key);
  return client;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
