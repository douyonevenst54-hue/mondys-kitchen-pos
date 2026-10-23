"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { confirmCloverPayments } from "@/lib/clover";
import { confirmSquarePayments } from "@/lib/square-online";
import { queueOrderNotifications } from "@/lib/notify";
import { normalizePhone, rewardsFor } from "@/lib/loyalty";
import { checkPromo } from "@/lib/promotions";
import { allowHit, clientIp } from "@/lib/rate-limit";
import {
  MAX_LINES,
  MAX_QTY_PER_LINE,
  OnlineOrderError,
  finalizeCardPayment,
  getPublicOrder,
  placeOnlineOrder,
  type OrderFix,
  type PublicOrder,
} from "@/lib/online-orders";

const OrderSchema = z.object({
  lines: z
    .array(
      z.object({
        menuItemId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE),
        modifierIds: z.array(z.string().max(64)).max(40).default([]),
      }),
    )
    .min(1, "Your cart is empty")
    .max(MAX_LINES),
  customerName: z.string().trim().min(2, "Enter your name").max(60),
  customerPhone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .transform((v) => (v.length === 11 && v.startsWith("1") ? v.slice(1) : v))
    .refine((v) => v.length === 10, "Enter a 10-digit phone number"),
  customerEmail: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email or leave it blank").max(120)])
    .transform((v) => (v ? v : null)),
  notes: z
    .string()
    .trim()
    .max(200, "Keep notes under 200 characters")
    .transform((v) => (v ? v : null)),
  payment: z.enum(["card", "pickup"]),
  pickupAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  smsOptIn: z.boolean().default(false),
  promoCode: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null)),
  useReward: z.boolean().default(false),
  marketingOptIn: z.boolean().default(false),
  // Hidden field real people never fill in. Bots usually do.
  website: z.string().max(0).optional().default(""),
});

export type SubmitOrderInput = z.input<typeof OrderSchema>;

export type SubmitOrderResult =
  | { ok: true; kind: "card"; orderId: string; clientSecret: string; total: number }
  | { ok: true; kind: "pickup"; orderId: string }
  | { ok: true; kind: "redirect"; orderId: string; href: string }
  | { ok: false; error: string; fix?: OrderFix | null };

export async function submitOnlineOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your order details" };
  }
  try {
    const { website: _honeypot, ...data } = parsed.data;
    void _honeypot;
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
    const returnBase = `${host.startsWith("localhost") ? proto : "https"}://${host}`;
    const res = await placeOnlineOrder({ ...data, returnBase });
    if (res.kind === "pickup") {
      revalidatePath("/online");
      revalidatePath("/");
    }
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof OnlineOrderError) return { ok: false, error: e.message, fix: e.fix };
    console.error("Online order failed:", e);
    return {
      ok: false,
      error: "Something went wrong on our side while placing your order.",
      fix: { kind: "call" },
    };
  }
}

export type ClientOrder = Omit<PublicOrder, "stripePaymentIntentId">;

function forClient(order: PublicOrder | null): ClientOrder | null {
  if (!order) return null;
  const { stripePaymentIntentId: _pi, ...rest } = order;
  void _pi;
  return rest;
}

/** Status page polling. Also finalizes a card payment if the webhook is late. */
export async function refreshOnlineOrder(orderId: string): Promise<ClientOrder | null> {
  if (typeof orderId !== "string" || orderId.length > 64) return null;
  const order = await getPublicOrder(orderId);
  if (order?.status === "OPEN" && order.payment?.method === "CLOVER_ONLINE") {
    try {
      // No webhook needed: look the payment up in Clover.
      if ((await confirmCloverPayments(order.id)) > 0) {
        revalidatePath("/online");
        return forClient(await getPublicOrder(orderId));
      }
    } catch (e) {
      console.error("Clover check from status page failed:", e);
    }
  }
  if (order?.status === "OPEN" && order.payment?.method === "SQUARE_ONLINE") {
    try {
      // No webhook needed: look the payment up in Square.
      if ((await confirmSquarePayments(order.id)) > 0) {
        revalidatePath("/online");
        return forClient(await getPublicOrder(orderId));
      }
    } catch (e) {
      console.error("Square check from status page failed:", e);
    }
  }
  if (order?.status === "OPEN" && order.stripePaymentIntentId) {
    try {
      await finalizeCardPayment(order.stripePaymentIntentId);
      return forClient(await getPublicOrder(orderId));
    } catch (e) {
      console.error("Finalize from status page failed:", e);
    }
  }
  if (order?.status === "VOIDED") queueOrderNotifications(order.id);
  return forClient(order);
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout previews (the order is always re-checked when it's placed)
// ─────────────────────────────────────────────────────────────────────────────

export type RewardsPreview = { enabled: boolean; points: number; rewardPoints: number; rewardValue: number; pointsPerDollar: number };

/** Points for a phone number. Shows only the balance, never a name. */
export async function previewRewards(phone: string): Promise<RewardsPreview | null> {
  const p = normalizePhone(typeof phone === "string" ? phone : "");
  if (!p) return null;
  if (!(await allowHit(`rw:${await clientIp()}`, 40, 60))) return null;
  return rewardsFor(p);
}

export type PromoPreview =
  | { ok: true; code: string; name: string; type: "PERCENT" | "FIXED_AMOUNT"; value: number; minSubtotal: number | null }
  | { ok: false; error: string };

export async function previewPromo(code: string, subtotal: number, phone: string): Promise<PromoPreview> {
  if (typeof code !== "string" || code.length > 30 || typeof subtotal !== "number" || !(subtotal >= 0)) {
    return { ok: false, error: "Type a promo code" };
  }
  if (!(await allowHit(`promo:${await clientIp()}`, 20, 60))) {
    return { ok: false, error: "Too many tries. Please wait a bit, or call us." };
  }
  const r = await checkPromo(code, subtotal, typeof phone === "string" ? phone : null);
  if (!r.ok) return r;
  return { ok: true, code: r.code, name: r.name, type: r.type, value: r.value, minSubtotal: r.minSubtotal };
}
