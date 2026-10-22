import "server-only";

/**
 * Square Terminal (card reader) through Square's Terminal API. The POS asks
 * Square to show an amount on the Terminal; the customer taps, inserts or
 * swipes; the POS checks the checkout until it's completed or canceled.
 *
 * Setup (Vercel env): SQUARE_ACCESS_TOKEN (the seller's access token from the
 * Square Developer Console), SQUARE_ENVIRONMENT = "production" or "sandbox",
 * SQUARE_LOCATION_ID. The Terminal is paired from Card reader settings.
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
};

export async function createTerminalCheckout(a: {
  amountCents: number;
  deviceId: string;
  referenceId: string;
  note: string;
  idempotencyKey: string;
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
        device_options: {
          device_id: a.deviceId,
          skip_receipt_screen: true, // the kiosk handles receipts
          tip_settings: { allow_tipping: false },
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
  amount_money: { amount: number; currency: string };
  total_money?: { amount: number; currency: string };
  card_details?: { card?: { card_brand?: string; last_4?: string } };
};

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
