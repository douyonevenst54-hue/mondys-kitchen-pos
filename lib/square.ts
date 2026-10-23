import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Square Terminal (card reader) through Square's Terminal API. The POS asks
 * Square to show an amount on the Terminal; the customer taps, inserts or
 * swipes; the POS checks the checkout until it's completed or canceled.
 *
 * Setup (Vercel env): SQUARE_ACCESS_TOKEN (the seller's access token from the
 * Square Developer Console), SQUARE_ENVIRONMENT = "production" or "sandbox",
 * SQUARE_LOCATION_ID. Terminals are paired from Square setup (register) and
 * Self-checkout setup (kiosk).
 *
 * Online orders pay on Square's own checkout page (a one-time payment link).
 * Optional: SQUARE_WEBHOOK_SIGNATURE_KEY (+ SQUARE_WEBHOOK_URL if the webhook
 * URL isn't PUBLIC_SITE_URL/api/square/webhook) so paid orders reach the
 * kitchen instantly; without it the POS looks the payment up in Square.
 * SQUARE_ONLINE_PAYMENTS=off keeps online card payments on Clover/Stripe.
 */

export class SquareError extends Error {}

const VERSION = "2026-09-16";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function squareStatus(): { enabled: boolean; sandbox: boolean; problem: string | null } {
  const sandbox = env("SQUARE_ENVIRONMENT") !== "production";
  if (!env("SQUARE_ACCESS_TOKEN")) return { enabled: false, sandbox, problem: "SQUARE_ACCESS_TOKEN is not set" };
  if (!env("SQUARE_LOCATION_ID")) return { enabled: false, sandbox, problem: "SQUARE_LOCATION_ID is not set" };
  return { enabled: true, sandbox, problem: null };
}

function base(): string {
  if (env("SQUARE_API_URL")) return env("SQUARE_API_URL").replace(/\/$/, ""); // tests
  return env("SQUARE_ENVIRONMENT") === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

async function sq<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env("SQUARE_ACCESS_TOKEN")}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { errors?: { code?: string; detail?: string }[] } & T;
  if (!res.ok) {
    const e = json.errors?.[0];
    throw new SquareError(e?.detail || e?.code || `Square error ${res.status}`);
  }
  return json;
}

export type TerminalCheckout = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "CANCEL_REQUESTED" | "CANCELED" | "COMPLETED";
  cancel_reason?: string;
  payment_ids?: string[];
  amount_money: { amount: number; currency: string };
  reference_id?: string;
  created_at?: string;
};

export async function createTerminalCheckout(a: {
  amountCents: number;
  deviceId: string;
  referenceId: string;
  note: string;
  idempotencyKey: string;
  /** Keyed in on the Terminal (phone orders) instead of tap/insert/swipe. */
  manualEntry?: boolean;
  /** Let Square offer its own email/text receipt on the Terminal. */
  squareReceipt?: boolean;
}): Promise<TerminalCheckout> {
  const r = await sq<{ checkout: TerminalCheckout }>("/v2/terminals/checkouts", {
    method: "POST",
    body: {
      idempotency_key: a.idempotencyKey.slice(0, 64),
      checkout: {
        amount_money: { amount: a.amountCents, currency: "USD" },
        reference_id: a.referenceId.slice(0, 40),
        note: a.note.slice(0, 250),
        deadline_duration: "PT3M",
        ...(a.manualEntry ? { payment_type: "MANUAL_CARD_ENTRY" } : {}),
        device_options: {
          device_id: a.deviceId,
          skip_receipt_screen: !a.squareReceipt, // the POS handles receipts
          tip_settings: { allow_tipping: false }, // tips are added on the POS screen
        },
      },
    },
  });
  return r.checkout;
}

export async function getTerminalCheckout(id: string): Promise<TerminalCheckout> {
  return (await sq<{ checkout: TerminalCheckout }>(`/v2/terminals/checkouts/${encodeURIComponent(id)}`)).checkout;
}

export async function cancelTerminalCheckout(id: string): Promise<TerminalCheckout> {
  return (await sq<{ checkout: TerminalCheckout }>(`/v2/terminals/checkouts/${encodeURIComponent(id)}/cancel`, { method: "POST" })).checkout;
}

export type SquarePayment = {
  id: string;
  status: string;
  order_id?: string;
  created_at?: string;
  amount_money: { amount: number; currency: string };
  total_money?: { amount: number; currency: string };
  card_details?: { card?: { card_brand?: string; last_4?: string } };
};

/** "VISA" → "Visa", "AMERICAN_EXPRESS" → "American express". */
export function squareCardBrand(p: SquarePayment): string | null {
  const b = p.card_details?.card?.card_brand;
  return b ? b.charAt(0) + b.slice(1).toLowerCase().replace(/_/g, " ") : null;
}

export const squarePaidCents = (p: SquarePayment) => (p.total_money ?? p.amount_money)?.amount ?? 0;

/** Payment ids are stored as "square:<id>" in Payment.processorRef (sometimes after other text). */
export function squarePaymentIdFrom(ref: string | null | undefined): string | null {
  const m = (ref ?? "").match(/square:([A-Za-z0-9_-]{4,})/);
  return m ? m[1] : null;
}

export async function getSquarePayment(id: string): Promise<SquarePayment> {
  return (await sq<{ payment: SquarePayment }>(`/v2/payments/${encodeURIComponent(id)}`)).payment;
}

export async function refundSquarePayment(paymentId: string, amountCents: number, reason: string): Promise<string> {
  const r = await sq<{ refund: { id: string } }>("/v2/refunds", {
    method: "POST",
    body: {
      idempotency_key: `refund-${paymentId}`.slice(0, 45),
      payment_id: paymentId,
      amount_money: { amount: amountCents, currency: "USD" },
      reason: reason.slice(0, 192),
    },
  });
  return r.refund.id;
}

// ── Online checkout (payment link) ──

export type PaymentLink = { id: string; url: string; order_id: string };

export async function createPaymentLink(a: {
  name: string;
  amountCents: number;
  redirectUrl: string;
  note: string;
  idempotencyKey: string;
  buyer: { email: string | null; phone: string | null };
}): Promise<PaymentLink> {
  const digits = (a.buyer.phone ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
  const r = await sq<{ payment_link: PaymentLink }>("/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: a.idempotencyKey.slice(0, 192),
      quick_pay: {
        name: a.name.slice(0, 255),
        price_money: { amount: a.amountCents, currency: "USD" },
        location_id: env("SQUARE_LOCATION_ID"),
      },
      checkout_options: { redirect_url: a.redirectUrl, allow_tipping: false, ask_for_shipping_address: false },
      pre_populated_data: {
        ...(a.buyer.email ? { buyer_email: a.buyer.email } : {}),
        ...(phone ? { buyer_phone_number: phone } : {}),
      },
      payment_note: a.note.slice(0, 500),
    },
  });
  if (!r.payment_link?.url || !r.payment_link.order_id) throw new SquareError("Square sent an unexpected answer");
  return r.payment_link;
}

/** Turn off a payment link so it can't be paid any more. */
export async function deletePaymentLink(id: string): Promise<void> {
  await sq(`/v2/online-checkout/payment-links/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type SquareOrder = {
  id: string;
  state: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELED";
  total_money?: { amount: number };
  tenders?: { id: string; type?: string; amount_money?: { amount: number } }[];
};

export async function getSquareOrder(id: string): Promise<SquareOrder> {
  return (await sq<{ order: SquareOrder }>(`/v2/orders/${encodeURIComponent(id)}`)).order;
}

/** Online payments go through Square when Square is set up (unless turned off). */
export function squareOnlineEnabled(): boolean {
  return squareStatus().enabled && env("SQUARE_ONLINE_PAYMENTS").toLowerCase() !== "off";
}

export function squareWebhookConfigured(): boolean {
  return env("SQUARE_WEBHOOK_SIGNATURE_KEY").length >= 8;
}

/**
 * Square signs webhooks with HMAC-SHA256(signature key, notification URL + raw
 * body), base64, in the "x-square-hmacsha256-signature" header.
 */
export function verifySquareSignature(rawBody: string, header: string | null, notificationUrl: string): boolean {
  const key = env("SQUARE_WEBHOOK_SIGNATURE_KEY");
  if (!key || !header) return false;
  const expected = createHmac("sha256", key).update(notificationUrl + rawBody).digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ── Pairing a Terminal ──

export type DeviceCode = { id: string; code: string; status: "UNPAIRED" | "PAIRED" | "EXPIRED"; device_id?: string; name?: string };

export async function createDeviceCode(name: string): Promise<DeviceCode> {
  const r = await sq<{ device_code: DeviceCode }>("/v2/devices/codes", {
    method: "POST",
    body: {
      idempotency_key: `pair-${Date.now()}`,
      device_code: { name: name.slice(0, 40), product_type: "TERMINAL_API", location_id: env("SQUARE_LOCATION_ID") },
    },
  });
  return r.device_code;
}

export async function getDeviceCode(id: string): Promise<DeviceCode> {
  return (await sq<{ device_code: DeviceCode }>(`/v2/devices/codes/${encodeURIComponent(id)}`)).device_code;
}
