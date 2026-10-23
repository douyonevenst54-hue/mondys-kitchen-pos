import { revalidatePath } from "next/cache";
import { verifySquareSignature } from "@/lib/square";
import { onSquarePaymentEvent } from "@/lib/square-online";
import { siteUrl } from "@/lib/notify";

/**
 * Square → POS. Square calls this when an online payment is made or changes
 * (subscribe to payment.created and payment.updated). The signature proves
 * the call came from Square, and the payment is checked with Square again
 * before the order goes to the kitchen.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const url = (process.env.SQUARE_WEBHOOK_URL ?? "").trim() || `${siteUrl()}/api/square/webhook`;
  if (!verifySquareSignature(raw, req.headers.get("x-square-hmacsha256-signature"), url)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type?: string; data?: { object?: { payment?: { id?: string; order_id?: string; status?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  const payment = event.data?.object?.payment;
  if (!event.type?.startsWith("payment.") || !payment?.id || payment.status !== "COMPLETED") {
    return Response.json({ received: true, ignored: true });
  }

  try {
    const result = await onSquarePaymentEvent(payment.id, payment.order_id ?? null);
    if (result === "done") {
      revalidatePath("/online");
      revalidatePath("/");
    }
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("Square webhook failed:", e);
    return new Response("Retry", { status: 500 }); // Square retries
  }
}
