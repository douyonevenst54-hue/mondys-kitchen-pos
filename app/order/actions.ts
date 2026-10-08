"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  MAX_LINES,
  MAX_QTY_PER_LINE,
  OnlineOrderError,
  finalizeCardPayment,
  getPublicOrder,
  placeOnlineOrder,
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
  // Hidden field real people never fill in. Bots usually do.
  website: z.string().max(0).optional().default(""),
});

export type SubmitOrderInput = z.input<typeof OrderSchema>;

export type SubmitOrderResult =
  | { ok: true; kind: "card"; orderId: string; clientSecret: string; total: number }
  | { ok: true; kind: "pickup"; orderId: string }
  | { ok: false; error: string };

export async function submitOnlineOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your order details" };
  }
  try {
    const { website: _honeypot, ...data } = parsed.data;
    void _honeypot;
    const res = await placeOnlineOrder(data);
    if (res.kind === "pickup") {
      revalidatePath("/online");
      revalidatePath("/");
    }
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof OnlineOrderError) return { ok: false, error: e.message };
    console.error("Online order failed:", e);
    return { ok: false, error: "Something went wrong placing your order. Please try again or call us." };
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
  if (order?.status === "OPEN" && order.stripePaymentIntentId) {
    try {
      await finalizeCardPayment(order.stripePaymentIntentId);
      return forClient(await getPublicOrder(orderId));
    } catch (e) {
      console.error("Finalize from status page failed:", e);
    }
  }
  return forClient(order);
}
