"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { restaurantTimeToDate } from "@/lib/online-hours";
import { emailStatus } from "@/lib/notify";
import { audienceCount, queueCampaign, sendTestEmail } from "@/lib/campaigns";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("");
const PromoSchema = z
  .object({
    id: z.string().max(64).nullable().default(null),
    name: z.string().trim().min(2, "Give the promotion a name").max(60),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/, "Codes are 3 to 20 letters or numbers, no spaces"),
    type: z.enum(["PERCENT", "FIXED_AMOUNT"]),
    value: z.number().positive("Enter how much off"),
    minSubtotal: z.number().min(0).nullable().default(null),
    startsOn: day,
    endsOn: day,
    maxUses: z.number().int().min(1).nullable().default(null),
    oncePerCustomer: z.boolean().default(false),
    online: z.boolean().default(true),
    bannerText: z.string().trim().max(90).default(""),
  })
  .refine((p) => p.type !== "PERCENT" || p.value <= 100, { message: "A percent can't be over 100", path: ["value"] })
  .refine((p) => !p.startsOn || !p.endsOn || p.startsOn <= p.endsOn, { message: "The end date is before the start date", path: ["endsOn"] });

export type PromoInput = z.input<typeof PromoSchema>;

export async function savePromo(input: PromoInput): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  const p = PromoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form" };
  const d = p.data;
  const { timezone } = await getSettings();
  const clash = await prisma.discount.findFirst({
    where: { code: { equals: d.code, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) },
    select: { id: true },
  });
  if (clash) return { ok: false, error: `The code ${d.code} is already used by another promotion` };
  const data = {
    name: d.name,
    code: d.code,
    type: d.type,
    value: d.value,
    minSubtotal: d.minSubtotal,
    startsAt: d.startsOn ? restaurantTimeToDate(`${d.startsOn}T00:00`, timezone) : null,
    endsAt: d.endsOn ? restaurantTimeToDate(`${d.endsOn}T23:59`, timezone) : null,
    maxUses: d.maxUses,
    oncePerCustomer: d.oncePerCustomer,
    online: d.online,
    bannerText: d.bannerText || null,
  };
  const row = d.id
    ? await prisma.discount.update({ where: { id: d.id }, data, select: { id: true } })
    : await prisma.discount.create({ data: { ...data, isActive: true }, select: { id: true } });
  revalidatePath("/promotions");
  revalidatePath("/order");
  return { ok: true, id: row.id };
}

export async function setPromoActive(id: string, active: boolean): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (typeof id !== "string" || id.length > 64) return { ok: false, error: "Invalid promotion" };
  await prisma.discount.update({ where: { id }, data: { isActive: active === true } });
  revalidatePath("/promotions");
  revalidatePath("/order");
  return { ok: true };
}

const CampaignSchema = z.object({
  subject: z.string().trim().min(3, "Add a subject").max(120),
  message: z.string().trim().min(10, "Write a short message").max(3000),
  discountId: z.string().max(64).nullable().default(null),
});

export async function sendCampaignTest(input: z.input<typeof CampaignSchema>, to: string): Promise<Result> {
  if (!(await getManagerFromSession())) return { ok: false, error: "Sign in as a manager" };
  if (!emailStatus().enabled) return { ok: false, error: "Email isn't set up yet (RESEND_API_KEY)" };
  const p = CampaignSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the message" };
  const email = z.string().trim().email().safeParse(to);
  if (!email.success) return { ok: false, error: "Enter the email to send the test to" };
  try {
    await sendTestEmail(email.data, p.data.subject, p.data.message, p.data.discountId);
  } catch (e) {
    console.error("Test email failed:", e);
    return { ok: false, error: "The email service refused it. Check the sending domain in Resend." };
  }
  return { ok: true };
}

export async function sendCampaignNow(input: z.input<typeof CampaignSchema>): Promise<Result> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Sign in as a manager" };
  if (!emailStatus().enabled) return { ok: false, error: "Email isn't set up yet (RESEND_API_KEY)" };
  const p = CampaignSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the message" };
  if ((await audienceCount()) === 0) return { ok: false, error: "No customers have signed up for emails yet" };
  // Guard against a double tap sending the same campaign twice.
  const recent = await prisma.campaign.findFirst({
    where: { subject: p.data.subject, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  });
  if (recent) return { ok: false, error: "This campaign was just sent. Change the subject to send another." };
  const c = await prisma.campaign.create({
    data: { subject: p.data.subject, message: p.data.message, discountId: p.data.discountId, createdById: manager.id },
    select: { id: true },
  });
  queueCampaign(c.id);
  revalidatePath("/promotions");
  return { ok: true, id: c.id };
}
