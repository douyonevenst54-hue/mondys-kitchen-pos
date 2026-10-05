import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { finalizeCardPayment } from "@/lib/online-orders";
import { revalidatePath } from "next/cache";

/**
 * Stripe → POS. Stripe calls this when a card payment succeeds; the order is
 * then sent to the kitchen. The signature check proves the call came from
 * Stripe, so nobody can fake a "paid" order.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return new Response("Webhook not configured", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    try {
      await finalizeCardPayment(pi.id);
      revalidatePath("/online");
      revalidatePath("/");
    } catch (e) {
      console.error("Webhook finalize failed:", e);
      // 500 makes Stripe retry later.
      return new Response("Retry", { status: 500 });
    }
  }

  return Response.json({ received: true });
}
