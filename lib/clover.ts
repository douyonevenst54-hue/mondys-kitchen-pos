import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { PortionError, sellPortions } from "@/lib/portions";

/**
 * Online card payments through Clover Hosted Checkout.
 *
 * The customer pays on Clover's own secure page (card numbers never touch
 * this app), then comes back to their order page. Clover tells us the payment
 * went through with a signed webhook; only then does the order go to the
 * kitchen.
 *
 * Settings (Vercel → Environment Variables):
 *   CLOVER_MERCHANT_ID        Merchant ID from the Clover dashboard
 *   CLOVER_ECOMM_PRIVATE_KEY  Ecommerce API token, type "Hosted checkout" (private key)
 *   CLOVER_WEBHOOK_SECRET     Signing secret from Ecommerce → Hosted Checkout → Webhook
 *   CLOVER_ENV                "production" (default) or "sandbox"
 */

const read = (name: string) => (process.env[name] ?? "").trim();

export type CloverStatus =
  | { enabled: true; env: "production" | "sandbox"; webhook: boolean }
  | { enabled: false; problem: string };

export function getCloverStatus(): CloverStatus {
  const mid = read("CLOVER_MERCHANT_ID");
  const key = read("CLOVER_ECOMM_PRIVATE_KEY");
  if (!mid && !key) return { enabled: false, problem: "Clover isn't connected" };
  if (!mid) return { enabled: false, problem: "CLOVER_MERCHANT_ID is missing" };
  if (!key) return { enabled: false, problem: "CLOVER_ECOMM_PRIVATE_KEY is missing" };
  if (!/^[A-Z0-9]{8,20}$/i.test(mid)) return { enabled: false, problem: "CLOVER_MERCHANT_ID doesn't look right (it's 13 letters and numbers)" };
  return {
    enabled: true,
    env: read("CLOVER_ENV").toLowerCase() === "sandbox" ? "sandbox" : "production",
    webhook: read("CLOVER_WEBHOOK_SECRET").length >= 8,
  };
}

function apiBase(): string {
  // Local testing only: a fake Clover server, and never with production.
  const fake = read("CLOVER_FAKE_API_URL");
  if (fake && read("CLOVER_ENV").toLowerCase() === "sandbox") return fake.replace(/\/$/, "");
  return read("CLOVER_ENV").toLowerCase() === "sandbox" ? "https://apisandbox.dev.clover.com" : "https://api.clover.com";
}

export class CloverError extends Error {}

/** Marks Clover payments in Payment.processorRef: "clover:<sessionId>[:<paymentId>]". */
const ref = (sessionId: string) => `clover:${sessionId}`;

/**
 * Start Clover's payment page for an order. The whole order (food + tax) is
 * sent as one line so Clover charges exactly the total this app calculated;
 * the items are listed in the note.
 */
export async function createCloverCheckout(args: {
  orderId: string;
  code: string;
  total: number;
  summary: string;
  customer: { name: string; email: string | null; phone: string };
  returnBase: string; // https://mondyskitchen.com
}): Promise<{ href: string; sessionId: string }> {
  const [firstName, ...rest] = args.customer.name.trim().split(/\s+/);
  const body = {
    customer: {
      firstName: firstName.slice(0, 40),
      lastName: (rest.join(" ") || "-").slice(0, 40),
      phoneNumber: args.customer.phone,
      ...(args.customer.email ? { email: args.customer.email } : {}),
    },
    shoppingCart: {
      lineItems: [
        {
          name: `Rosewood Cafe order ${args.code}`.slice(0, 127),
          price: Math.round(args.total * 100), // cents
          unitQty: 1,
          note: args.summary.slice(0, 255),
        },
      ],
    },
    redirectUrls: {
      success: `${args.returnBase}/order/status/${args.orderId}`,
      failure: `${args.returnBase}/order/status/${args.orderId}?payment=failed`,
      cancel: `${args.returnBase}/order/status/${args.orderId}?payment=cancelled`,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${apiBase()}/invoicingcheckoutservice/v1/checkouts`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${read("CLOVER_ECOMM_PRIVATE_KEY")}`,
        "X-Clover-Merchant-Id": read("CLOVER_MERCHANT_ID"),
        "User-Agent": "RosewoodCafePOS/1.0",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("Clover checkout: network error", e);
    throw new CloverError("Couldn't reach Clover");
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`Clover checkout failed (${res.status}): ${text.slice(0, 500)}`);
    throw new CloverError(res.status === 401 ? "Clover rejected the API token" : "Clover didn't accept the checkout");
  }
  let data: { href?: string; checkoutSessionId?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new CloverError("Clover sent an unexpected answer");
  }
  const testing = Boolean(read("CLOVER_FAKE_API_URL")) && read("CLOVER_ENV").toLowerCase() === "sandbox";
  if (!data.href || !data.checkoutSessionId || !(testing ? /^https?:\/\//.test(data.href) : /^https:\/\//.test(data.href))) {
    console.error("Clover checkout: missing href/session", text.slice(0, 500));
    throw new CloverError("Clover sent an unexpected answer");
  }
  return { href: data.href, sessionId: data.checkoutSessionId };
}

/** Remember which Clover checkout belongs to the order's payment. */
export async function attachCloverSession(orderId: string, sessionId: string) {
  await prisma.payment.updateMany({
    where: { orderId, method: "CLOVER_ONLINE", status: "PENDING" },
    data: { processorRef: ref(sessionId) },
  });
}

/**
 * Check Clover's webhook signature: header "Clover-Signature: t=<time>,v1=<hex>",
 * where v1 = HMAC-SHA256(secret, "<time>.<raw body>"). Rejects stale messages.
 */
export function verifyCloverSignature(rawBody: string, header: string | null, now = Date.now()): boolean {
  const secret = read("CLOVER_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  // Clover may send seconds or milliseconds.
  const sentMs = t.length > 11 ? Number(t) : Number(t) * 1000;
  if (Math.abs(now - sentMs) > 10 * 60_000) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Clover says a checkout was paid: send the order to the kitchen. Safe to
 * call more than once; only the first call does anything.
 */
export async function finalizeCloverPayment(sessionId: string, paymentId: string): Promise<"done" | "already" | "unknown"> {
  const payment = await prisma.payment.findFirst({
    where: { method: "CLOVER_ONLINE", processorRef: { startsWith: ref(sessionId) } },
    select: { id: true, status: true, orderId: true, order: { select: { status: true, staffId: true } } },
  });
  if (!payment) return "unknown";
  if (payment.status === "COMPLETED") return "already";

  const settings = await getSettings();
  const readyAt = new Date(Date.now() + settings.onlinePrepTimeMinutes * 60_000);

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "COMPLETED", processedAt: new Date(), processorRef: `${ref(sessionId)}:${paymentId}`.slice(0, 190) },
    });
    if (claimed.count === 0) return "already" as const;

    const items = await tx.orderItem.findMany({ where: { orderId: payment.orderId }, select: { menuItemId: true, quantity: true } });
    let soldOutNote: string | null = null;
    try {
      await tx.$executeRaw`SAVEPOINT portions`;
      await sellPortions(tx, items, payment.order.staffId, payment.orderId);
    } catch (e) {
      if (!(e instanceof PortionError)) throw e;
      // Paid already: still send it, and tell the team to call the customer.
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT portions`;
      soldOutNote = `⚠ Paid by card, then: ${e.message}. Call the customer to swap or refund in Clover.`;
    }
    const order = await tx.order.findUnique({ where: { id: payment.orderId }, select: { notes: true } });
    await tx.order.updateMany({
      where: { id: payment.orderId, status: "OPEN" },
      data: {
        status: "SENT",
        estimatedReadyAt: readyAt,
        ...(soldOutNote ? { notes: [soldOutNote, order?.notes].filter(Boolean).join(" · ").slice(0, 500) } : {}),
      },
    });
    return "done" as const;
  });
  return result;
}
