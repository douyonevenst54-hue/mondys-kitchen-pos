import "server-only";
import { getCloverStatus } from "@/lib/clover";
import { squareOnlineEnabled } from "@/lib/square";
import { getCardStatus } from "@/lib/stripe-config";

export type OnlineCardProvider = "square" | "clover" | "stripe";

/**
 * Who takes online card payments: Square when it's set up, then Clover, then
 * Stripe. Moving from Clover to Square only takes the Square settings.
 */
export function onlineCardProvider(): OnlineCardProvider | null {
  if (squareOnlineEnabled()) return "square";
  if (getCloverStatus().enabled) return "clover";
  if (getCardStatus().enabled) return "stripe";
  return null;
}

export const PROVIDER_NAME: Record<OnlineCardProvider, string> = { square: "Square", clover: "Clover", stripe: "Stripe" };
