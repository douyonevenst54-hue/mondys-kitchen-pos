"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStaffFromSession } from "@/lib/staff";
import { checkManagerPin } from "@/lib/manager-pin";
import { prisma } from "@/lib/prisma";
import {
  KioskError,
  cancelKioskPayment,
  checkKioskPayment,
  kioskLookup,
  simulateKioskTap,
  startKioskPayment,
  type KioskItem,
  type KioskPayState,
} from "@/lib/kiosk";
import { queueReceipt } from "@/lib/print-queue";
import { receiptText } from "@/lib/receipt-text";
import { emailStatus, sendEmail } from "@/lib/notify";
import { getBrand } from "@/lib/brand";

/** The kiosk tablet is signed in by a staff member who set it up; customers never sign in. */
async function guard(): Promise<string | null> {
  const s = await getStaffFromSession();
  return s ? null : "This screen was signed out. Please ask a staff member.";
}

const Id = z.string().min(1).max(64);
const Lines = z.array(z.object({ menuItemId: Id, quantity: z.number().int().min(1).max(20) })).min(1).max(40);

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<R<{ value: T }>> {
  const g = await guard();
  if (g) return { ok: false, error: g };
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof KioskError) return { ok: false, error: e.message };
    console.error("Kiosk action failed:", e);
    return { ok: false, error: "Something went wrong. Please try again or ask a staff member." };
  }
}

export async function kioskScan(code: string): Promise<R<{ value: { ok: true; item: KioskItem } | { ok: false; message: string } }>> {
  return run(() => kioskLookup(typeof code === "string" ? code.slice(0, 40) : ""));
}

export async function kioskPay(lines: { menuItemId: string; quantity: number }[]): Promise<R<{ value: { orderId: string; pay: KioskPayState } }>> {
  const p = Lines.safeParse(lines);
  if (!p.success) return { ok: false, error: "Scan an item first" };
  const r = await run(() => startKioskPayment(p.data));
  if (r.ok) revalidatePath("/online");
  return r;
}

export async function kioskCheck(orderId: string): Promise<R<{ value: KioskPayState }>> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  return run(() => checkKioskPayment(id.data));
}

export async function kioskCancel(orderId: string): Promise<R<{ value: KioskPayState }>> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  return run(() => cancelKioskPayment(id.data));
}

export async function kioskSimulateTap(orderId: string): Promise<R<{ value: KioskPayState }>> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  return run(() => simulateKioskTap(id.data));
}

/** Receipt after payment: print it, or email it. Only for a paid self-checkout order. */
export async function kioskReceipt(orderId: string, how: "print" | "email", email?: string): Promise<R<{ value: string }>> {
  const id = Id.safeParse(orderId);
  if (!id.success) return { ok: false, error: "Invalid order" };
  return run(async () => {
    const o = await prisma.order.findFirst({ where: { id: id.data, source: "KIOSK", status: "COMPLETED" }, select: { id: true, orderNumber: true } });
    if (!o) throw new KioskError("This order isn't paid yet");
    if (how === "print") {
      await queueReceipt(o.id);
      return "Your receipt is printing.";
    }
    const to = z.string().trim().email().safeParse(email);
    if (!to.success) throw new KioskError("Enter a valid email address");
    if (!emailStatus().enabled) throw new KioskError("Email receipts aren't set up. Please ask for a printed receipt.");
    const sent = await prisma.printJob.count({ where: { orderId: o.id, kind: "email" } });
    if (sent >= 3) throw new KioskError("Receipt already sent");
    const text = (await receiptText(o.id)) ?? "";
    const brand = await getBrand();
    await sendEmail({
      to: to.data,
      subject: `Your receipt from ${brand.name} (#${o.orderNumber})`,
      text,
      html: `<pre style="font:14px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`,
    });
    await prisma.printJob.create({ data: { orderId: o.id, kind: "email", content: to.data, printedAt: new Date() } });
    return `Receipt sent to ${to.data}.`;
  });
}

/** Leaving the kiosk needs a manager PIN, so customers can't reach the register. */
export async function exitKiosk(pin: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getStaffFromSession();
  if (!s) return { ok: true };
  const m = await checkManagerPin(typeof pin === "string" ? pin : "", s.id);
  return m.ok ? { ok: true } : { ok: false, error: m.error };
}
