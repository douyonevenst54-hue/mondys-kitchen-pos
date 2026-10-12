import { revalidatePath } from "next/cache";
import { finalizeCloverPayment, verifyCloverSignature } from "@/lib/clover";

/**
 * Clover → POS. Clover calls this when a customer finishes paying on the
 * Hosted Checkout page. The signature proves the call came from Clover, so
 * nobody can fake a "paid" order. Only APPROVED payments go to the kitchen.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCloverSignature(raw, req.headers.get("clover-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  // Field names are matched without caring about capital letters.
  const get = (k: string) => {
    const hit = Object.keys(event).find((x) => x.toLowerCase() === k.toLowerCase());
    const v = hit ? event[hit] : undefined;
    return typeof v === "string" ? v : "";
  };

  const merchant = (process.env.CLOVER_MERCHANT_ID ?? "").trim();
  if (get("merchantId") && merchant && get("merchantId") !== merchant) {
    return new Response("Wrong merchant", { status: 400 });
  }
  if (get("type").toUpperCase() !== "PAYMENT" || get("status").toUpperCase() !== "APPROVED") {
    return Response.json({ received: true, ignored: true });
  }
  const sessionId = get("data");
  const paymentId = get("id");
  if (!sessionId) return new Response("Missing checkout session", { status: 400 });

  try {
    const result = await finalizeCloverPayment(sessionId, paymentId);
    if (result === "done") {
      revalidatePath("/online");
      revalidatePath("/");
    }
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("Clover webhook finalize failed:", e);
    return new Response("Retry", { status: 500 }); // Clover retries
  }
}
