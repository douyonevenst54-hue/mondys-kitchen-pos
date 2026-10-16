import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { emailStatus, siteUrl } from "@/lib/notify";

/**
 * Email campaigns to customers who ticked "Email me specials" at checkout.
 * Every email carries the restaurant's address and an unsubscribe link
 * (CAN-SPAM), plus the one-click unsubscribe header mail apps show.
 */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

export function unsubscribeToken(customerId: string): string {
  return createHmac("sha256", secret()).update(`unsub:${customerId}`).digest("hex").slice(0, 32);
}

export function checkUnsubscribeToken(customerId: string, token: string): boolean {
  if (!/^[a-z0-9]{10,40}$/.test(customerId) || !/^[0-9a-f]{32}$/.test(token)) return false;
  const want = Buffer.from(unsubscribeToken(customerId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function unsubscribeUrl(customerId: string): string {
  return `${siteUrl()}/order/unsubscribe?u=${customerId}&t=${unsubscribeToken(customerId)}`;
}

export async function optOut(customerId: string): Promise<void> {
  await prisma.customer.updateMany({
    where: { id: customerId },
    data: { marketingOptIn: false, optOutAt: new Date() },
  });
}

export async function audienceCount(): Promise<number> {
  return prisma.customer.count({ where: { marketingOptIn: true, email: { not: null } } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Promo = { code: string; label: string } | null;

function render(subject: string, message: string, promo: Promo, s: { name: string; address: string | null; phone: string | null }, unsub: string) {
  const paras = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const order = `${siteUrl()}/order`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6f1e7;font-family:Arial,Helvetica,sans-serif;color:#231f1a">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8a5a3b">${esc(s.name)}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${esc(subject)}</h1>
${paras}
${promo ? `<div style="background:#fff;border-radius:14px;padding:16px;margin:0 0 16px;text-align:center"><p style="margin:0;font-size:13px;color:#6b6157">${esc(promo.label)}</p><p style="margin:4px 0 0;font-size:26px;font-weight:bold;letter-spacing:2px">${esc(promo.code)}</p></div>` : ""}
<p style="margin:0 0 24px"><a href="${order}" style="display:inline-block;background:#231f1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold">Order online</a></p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#6b6157">You're getting this because you asked for Rosewood specials when you ordered.
<a href="${unsub}" style="color:#6b6157">Unsubscribe</a>.<br>${esc(s.name)}${s.address ? ` · ${esc(s.address)}` : ""}${s.phone ? ` · ${esc(s.phone)}` : ""}</p>
</div></body></html>`;
  const text = `${subject}\n\n${message}\n\n${promo ? `${promo.label}: ${promo.code}\n\n` : ""}Order online: ${order}\n\nUnsubscribe: ${unsub}\n${s.name}${s.address ? `, ${s.address}` : ""}`;
  return { html, text };
}

async function postBatch(emails: object[]) {
  const res = await fetch(process.env.RESEND_BATCH_URL || "https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function promoFor(discountId: string | null): Promise<Promo> {
  if (!discountId) return null;
  const d = await prisma.discount.findUnique({ where: { id: discountId }, select: { code: true, type: true, value: true, minSubtotal: true } });
  if (!d) return null;
  const off = d.type === "PERCENT" ? `${Number(d.value)}% off` : `$${Number(d.value).toFixed(2)} off`;
  return { code: d.code, label: `${off}${d.minSubtotal ? ` orders of $${Number(d.minSubtotal).toFixed(2)}+` : ""} with code` };
}

/** One email to one address, for checking how it looks. */
export async function sendTestEmail(to: string, subject: string, message: string, discountId: string | null): Promise<void> {
  const s = await getSettings();
  const { html, text } = render(subject, message, await promoFor(discountId), s, `${siteUrl()}/order`);
  await postBatch([{ from: emailStatus().from, to: [to], subject: `[Test] ${subject}`, html, text }]);
}

/** Send a saved campaign to everyone opted in, in batches of 100, after the response. */
export function queueCampaign(campaignId: string): void {
  const run = () => sendCampaign(campaignId).catch((e) => console.error("Campaign failed:", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

async function sendCampaign(campaignId: string): Promise<void> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.finishedAt) return;
  const s = await getSettings();
  const promo = await promoFor(c.discountId);
  const people = await prisma.customer.findMany({
    where: { marketingOptIn: true, email: { not: null } },
    select: { id: true, email: true },
  });
  await prisma.campaign.update({ where: { id: c.id }, data: { recipients: people.length } });
  const from = emailStatus().from;
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < people.length; i += 100) {
    const chunk = people.slice(i, i + 100);
    const emails = chunk.map((p) => {
      const unsub = unsubscribeUrl(p.id);
      const { html, text } = render(c.subject, c.message, promo, s, unsub);
      return {
        from,
        to: [p.email],
        subject: c.subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${siteUrl()}/order/unsubscribe/one-click?u=${p.id}&t=${unsubscribeToken(p.id)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });
    try {
      await postBatch(emails);
      sent += chunk.length;
    } catch (e) {
      console.error("Campaign batch failed:", e);
      failed += chunk.length;
    }
    await prisma.campaign.update({ where: { id: c.id }, data: { sentCount: sent, failedCount: failed } });
  }
  await prisma.campaign.update({ where: { id: c.id }, data: { finishedAt: new Date() } });
}
