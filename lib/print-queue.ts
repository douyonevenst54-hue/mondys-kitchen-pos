import "server-only";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { receiptText } from "@/lib/receipt-text";
import { siteUrl } from "@/lib/notify";

/**
 * Receipt printing through Star CloudPRNT. The printer (Star mC-Print3,
 * TSP143IV…) checks the POS every few seconds over the internet, so it works
 * with the POS hosted online — no computer or app at the counter. Jobs wait
 * here until the printer confirms it printed them.
 */

/** Secret part of the printer's URL, derived from SESSION_SECRET (no extra setting). */
export function cloudPrntToken(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", secret).update("cloudprnt-v1").digest("hex").slice(0, 24);
}

/** The "Server URL" to type into the printer's CloudPRNT settings. */
export function cloudPrntUrl(): string {
  return `${siteUrl()}/api/cloudprnt?t=${cloudPrntToken()}`;
}

export async function queueReceipt(orderId: string): Promise<boolean> {
  const content = await receiptText(orderId);
  if (!content) return false;
  // One receipt per order per minute, so a double tap doesn't print twice.
  const recent = await prisma.printJob.findFirst({
    where: { orderId, kind: "receipt", createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (recent) return true;
  await prisma.printJob.create({ data: { orderId, kind: "receipt", content } });
  return true;
}

export async function queueTestPrint(name: string): Promise<void> {
  await prisma.printJob.create({
    data: { kind: "test", content: `${name}\n\nTest print OK\n${new Date().toISOString()}\n\nReceipts from the self-checkout will print here.\n` },
  });
}

/** Printer is "connected" if it checked in during the last 2 minutes. */
export async function printerStatus(): Promise<{ mac: string | null; online: boolean; waiting: number }> {
  const [s, waiting] = await Promise.all([
    prisma.restaurantSettings.findFirst({ select: { receiptPrinterMac: true, receiptPrinterSeenAt: true } }),
    prisma.printJob.count({ where: { printedAt: null, attempts: { lt: 3 }, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }),
  ]);
  return {
    mac: s?.receiptPrinterMac ?? null,
    online: Boolean(s?.receiptPrinterSeenAt && Date.now() - s.receiptPrinterSeenAt.getTime() < 120_000),
    waiting,
  };
}
