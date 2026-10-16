"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { businessDate, isBusinessDate } from "@/lib/business-date";
import { getSettings } from "@/lib/menu";

export type MessageResult = { ok: true } | { ok: false; error: string };

const MAX_PER_HOUR = 5;

const Phone = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .transform((v) => (v.length === 11 && v.startsWith("1") ? v.slice(1) : v))
  .refine((v) => v === "" || v.length === 10, "Enter a 10-digit phone number");
const Email = z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(120)]);
const Name = z.string().trim().max(60);

const MessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CONTACT"),
    name: Name.min(2, "Enter your name"),
    phone: Phone,
    email: Email,
    message: z.string().trim().min(5, "Write your message").max(1000, "Keep it under 1000 characters"),
  }),
  z.object({
    kind: z.literal("CATERING"),
    name: Name.min(2, "Enter your name"),
    phone: Phone,
    email: Email,
    eventDate: z.string().refine((v) => isBusinessDate(v), "Pick the event date"),
    guests: z.number().int().min(5, "Catering is for 5 people or more").max(2000, "Call us for events over 2000 people"),
    message: z.string().trim().min(5, "Tell us about the event").max(1500, "Keep it under 1500 characters"),
  }),
  z.object({
    kind: z.literal("FEEDBACK"),
    name: Name,
    phone: Phone,
    email: Email,
    rating: z.number().int().min(1, "Choose a rating").max(5),
    orderCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(12)
      .refine((v) => v === "" || /^MK-\d{6}$/.test(v), "Order codes look like MK-123456"),
    message: z.string().trim().max(1000, "Keep it under 1000 characters"),
  }),
]);

export type MessageInput = z.input<typeof MessageSchema> & { website?: string };

/** Contact, catering and feedback from the online order page. */
export async function sendCustomerMessage(input: MessageInput): Promise<MessageResult> {
  // Hidden field people never fill in; bots usually do. Pretend it worked.
  if (input.website) return { ok: true };

  const p = MessageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form" };
  const d = p.data;

  if ((d.kind === "CONTACT" || d.kind === "CATERING") && !d.phone && !d.email) {
    return { ok: false, error: "Leave a phone number or an email so we can get back to you" };
  }
  if (d.kind === "CATERING") {
    const { timezone } = await getSettings();
    if (d.eventDate < businessDate(timezone)) return { ok: false, error: "The event date has already passed" };
  }

  // At most 5 messages an hour from one connection.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = `msg:${ip}`;
  const t = await prisma.loginThrottle.findUnique({ where: { key } });
  const fresh = !t || Date.now() - t.updatedAt.getTime() > 60 * 60_000;
  if (!fresh && t && t.failures >= MAX_PER_HOUR) {
    return { ok: false, error: "Thanks! We've received several messages from you. Please call us if it's urgent." };
  }
  await prisma.loginThrottle.upsert({
    where: { key },
    update: { failures: fresh ? 1 : { increment: 1 } },
    create: { key, failures: 1 },
  });

  await prisma.customerMessage.create({
    data: {
      kind: d.kind,
      name: d.name || null,
      phone: d.phone || null,
      email: d.email || null,
      message: d.message || "(no comment)",
      eventDate: d.kind === "CATERING" ? d.eventDate : null,
      guests: d.kind === "CATERING" ? d.guests : null,
      rating: d.kind === "FEEDBACK" ? d.rating : null,
      orderCode: d.kind === "FEEDBACK" ? d.orderCode || null : null,
    },
  });
  revalidatePath("/messages");
  return { ok: true };
}
