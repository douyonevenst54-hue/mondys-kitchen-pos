import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { PortionError, sellPortions } from "@/lib/portions";
import { isForLaterDay } from "@/lib/online-hours";
import { queueOrderNotifications } from "@/lib/notify";

/** Online card methods paid on the processor's own page (Clover or Square). */
export type HostedMethod = "CLOVER_ONLINE" | "SQUARE_ONLINE";

const SOLD_OUT_HINT: Record<HostedMethod, string> = {
  CLOVER_ONLINE: "Call the customer to swap or refund in Clover.",
  SQUARE_ONLINE: "Call the customer to swap, or void the order to refund the card.",
};

/**
 * The processor confirmed an online order's payment: mark it paid and send it
 * to the kitchen. `proof` is stored on the payment (processor payment id, or
 * who confirmed it). Safe to call more than once; only the first call counts.
 */
export async function completePaidOnlineOrder(
  orderId: string,
  method: HostedMethod,
  proof: string,
  card: { brand: string | null; last4: string | null } | null = null,
): Promise<"done" | "already" | "unknown"> {
  const payment = await prisma.payment.findFirst({
    where: { orderId, method },
    select: { id: true, status: true, processorRef: true, order: { select: { status: true, staffId: true } } },
  });
  if (!payment) return "unknown";
  if (payment.status === "COMPLETED") return "already";
  if (payment.order.status !== "OPEN") return "already";

  const settings = await getSettings();
  const asap = new Date(Date.now() + settings.onlinePrepTimeMinutes * 60_000);
  const scheduled = (await prisma.order.findUnique({ where: { id: orderId }, select: { scheduledPickupAt: true } }))?.scheduledPickupAt;
  const readyAt = scheduled && scheduled > asap ? scheduled : asap;
  const keepRef = payment.processorRef && !proof.startsWith(payment.processorRef) ? `${payment.processorRef}|${proof}` : proof;

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        processorRef: keepRef.slice(0, 190),
        ...(card ? { cardBrand: card.brand, cardLast4: card.last4 } : {}),
      },
    });
    if (claimed.count === 0) return "already" as const;

    const items = await tx.orderItem.findMany({ where: { orderId }, select: { menuItemId: true, quantity: true } });
    let soldOutNote: string | null = null;
    try {
      await tx.$executeRaw`SAVEPOINT portions`;
      if (!isForLaterDay(scheduled, settings.timezone)) await sellPortions(tx, items, payment.order.staffId, orderId);
    } catch (e) {
      if (!(e instanceof PortionError)) throw e;
      // Paid already: still send it, and tell the team to call the customer.
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT portions`;
      soldOutNote = `⚠ Paid by card, then: ${e.message}. ${SOLD_OUT_HINT[method]}`;
    }
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { notes: true } });
    await tx.order.updateMany({
      where: { id: orderId, status: "OPEN" },
      data: {
        status: "SENT",
        estimatedReadyAt: readyAt,
        ...(soldOutNote ? { notes: [soldOutNote, order?.notes].filter(Boolean).join(" · ").slice(0, 500) } : {}),
      },
    });
    return "done" as const;
  });
  if (result === "done") queueOrderNotifications(orderId);
  return result;
}
