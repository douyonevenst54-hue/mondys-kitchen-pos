import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { PUBLIC_ORDER_HOSTS } from "@/lib/public-hosts";

/**
 * Customer updates for online orders: received, ready for pickup, cancelled.
 *
 * Email goes through Resend (RESEND_API_KEY + a verified sending domain).
 * Text messages go through Twilio, only when TWILIO_* is set AND the customer
 * ticked "Text me" at checkout. Either can be off; ordering never waits on
 * them or fails because of them.
 *
 * Call queueOrderNotifications(orderId) after any status change. It looks at
 * the order and sends whatever hasn't been sent yet, once (each message is
 * claimed in the database before it goes out).
 */

export function emailStatus(): { enabled: boolean; from: string; problem: string | null } {
  const from = process.env.NOTIFY_FROM_EMAIL || "Rosewood Cafe <orders@mondyskitchen.com>";
  if (!process.env.RESEND_API_KEY) return { enabled: false, from, problem: "RESEND_API_KEY is not set" };
  return { enabled: true, from, problem: null };
}

export function smsStatus(): { enabled: boolean; problem: string | null } {
  const missing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"].filter((k) => !process.env[k]);
  return missing.length ? { enabled: false, problem: `${missing.join(", ")} not set` } : { enabled: true, problem: null };
}

export function siteUrl(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const host = PUBLIC_ORDER_HOSTS.find((h) => h.startsWith("www.")) ?? PUBLIC_ORDER_HOSTS[0] ?? "mondyskitchen.com";
  return `https://${host}`;
}

/** Schedule the check after the response is sent; never throws. */
export function queueOrderNotifications(orderId: string): void {
  const run = () => sendOrderNotifications(orderId).catch((e) => console.error("Order notification failed:", e));
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts): just send
  }
}

type Kind = "received" | "ready" | "cancelled";

export async function sendOrderNotifications(orderId: string): Promise<Kind[]> {
  const email = emailStatus();
  const sms = smsStatus();
  if (!email.enabled && !sms.enabled) return [];

  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      source: true,
      status: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      smsOptIn: true,
      onlineConfirmationCode: true,
      scheduledPickupAt: true,
      estimatedReadyAt: true,
      createdAt: true,
      total: true,
      voidedReason: true,
      notifyReceivedAt: true,
      notifyReadyAt: true,
      notifyCancelledAt: true,
      items: { select: { nameSnapshot: true, quantity: true, notes: true, lineTotal: true } },
      payments: { select: { method: true, status: true }, take: 1 },
    },
  });
  if (!o || o.source !== "ONLINE_PICKUP") return [];
  const wantsEmail = email.enabled && Boolean(o.customerEmail);
  const wantsSms = sms.enabled && o.smsOptIn && Boolean(o.customerPhone);
  if (!wantsEmail && !wantsSms) return [];

  const due: Kind[] = [];
  // (Already picked up before we got to it? Then "received" is pointless.)
  if ((o.status === "SENT" || o.status === "READY") && !o.notifyReceivedAt) due.push("received");
  if (o.status === "READY" && !o.notifyReadyAt) due.push("ready");
  if (o.status === "VOIDED" && o.notifyReceivedAt && !o.notifyCancelledAt) due.push("cancelled");

  const settings = await getSettings();
  const sent: Kind[] = [];
  for (const kind of due) {
    // Claim it first, so two servers never send the same message twice.
    const field = kind === "received" ? "notifyReceivedAt" : kind === "ready" ? "notifyReadyAt" : "notifyCancelledAt";
    const claimed = await prisma.order.updateMany({ where: { id: o.id, [field]: null }, data: { [field]: new Date() } });
    if (claimed.count === 0) continue;

    const msg = compose(kind, o, settings);
    if (wantsEmail) {
      await sendEmail({
        to: o.customerEmail!,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: settings.email ?? undefined,
      }).catch((e) => console.error(`Email (${kind}) for ${o.onlineConfirmationCode} failed:`, e));
    }
    // Texts only for the moments that matter at the counter.
    if (wantsSms && kind !== "received") {
      await sendSms(`+1${o.customerPhone}`, msg.sms).catch((e) =>
        console.error(`Text (${kind}) for ${o.onlineConfirmationCode} failed:`, e),
      );
    }
    sent.push(kind);
  }
  return sent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

type OrderForMsg = {
  id: string;
  customerName: string | null;
  onlineConfirmationCode: string | null;
  scheduledPickupAt: Date | null;
  estimatedReadyAt: Date | null;
  createdAt: Date;
  total: { toString(): string };
  voidedReason: string | null;
  items: { nameSnapshot: string; quantity: number; notes: string | null; lineTotal: { toString(): string } }[];
  payments: { method: string; status: string }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (v: { toString(): string }) => `$${Number(v.toString()).toFixed(2)}`;

function compose(
  kind: Kind,
  o: OrderForMsg,
  s: { name: string; address: string | null; phone: string | null; timezone: string },
) {
  const code = o.onlineConfirmationCode ?? "";
  const link = `${siteUrl()}/order/status/${o.id}`;
  const first = (o.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const fmt = (d: Date, withDay: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      ...(withDay ? { weekday: "long", month: "short", day: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
      timeZone: s.timezone,
    }).format(d);
  const sameDay = (a: Date, b: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone }).format(a) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone }).format(b);
  const when = o.scheduledPickupAt
    ? `Pickup ${sameDay(o.scheduledPickupAt, o.createdAt) ? "at" : "on"} ${fmt(o.scheduledPickupAt, !sameDay(o.scheduledPickupAt, o.createdAt))}`
    : o.estimatedReadyAt
      ? `Ready around ${fmt(o.estimatedReadyAt, false)}`
      : "";
  const p = o.payments[0];
  const paid = p && (p.method === "STRIPE_ONLINE" || p.method === "CLOVER_ONLINE") && p.status !== "PENDING";
  const refunded = p?.status === "REFUNDED";

  let subject: string;
  let headline: string;
  let body: string;
  let sms: string;
  if (kind === "received") {
    subject = `Order ${code} received · ${s.name}`;
    headline = `Thanks, ${first}! We got your order.`;
    body = `${when ? `${when}. ` : ""}${paid ? `Paid ${money(o.total)} by card.` : `You'll pay ${money(o.total)} at the counter, cash or card.`}`;
    sms = `${s.name}: order ${code} received. ${when}. Track it: ${link}`;
  } else if (kind === "ready") {
    subject = `Your order is ready for pickup · ${code}`;
    headline = `Your order is ready, ${first}!`;
    body = `Come to the counter and give your code <b>${esc(code)}</b>.${paid ? "" : ` Total due: ${money(o.total)}.`}`;
    sms = `${s.name}: order ${code} is ready for pickup! Give your code at the counter.${s.address ? ` ${s.address}` : ""} Reply STOP to opt out.`;
  } else {
    subject = `Order ${code} was cancelled · ${s.name}`;
    headline = "Your order was cancelled";
    body = `${o.voidedReason ? `${esc(o.voidedReason)}. ` : ""}${
      refunded
        ? "Your card was refunded in full. It usually shows on your statement within 5 to 10 business days."
        : paid
          ? "We'll refund your card. Call us if you don't see it within a few days."
          : "Nothing was charged."
    }`;
    sms = `${s.name}: order ${code} was cancelled.${refunded ? " Your card was refunded." : ""} Questions? Call ${s.phone ?? "us"}. Reply STOP to opt out.`;
  }

  const items = o.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;vertical-align:top">${i.quantity} × ${esc(i.nameSnapshot)}${
          i.notes ? `<br><span style="color:#6b6157;font-size:13px">${esc(i.notes)}</span>` : ""
        }</td><td style="padding:6px 0;text-align:right;vertical-align:top">${money(i.lineTotal)}</td></tr>`,
    )
    .join("");
  const tel = s.phone ? s.phone.replace(/\D/g, "") : "";
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6f1e7;font-family:Arial,Helvetica,sans-serif;color:#231f1a">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8a5a3b">${esc(s.name)}</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${esc(headline)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${body}</p>
<div style="background:#fff;border-radius:14px;padding:16px;margin:0 0 16px">
<p style="margin:0;font-size:12px;color:#6b6157">Order code</p>
<p style="margin:0 0 12px;font-size:28px;font-weight:bold;letter-spacing:1px">${esc(code)}</p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${items}
<tr><td style="padding:10px 0 0;border-top:1px solid #e6dccd;font-weight:bold">Total</td><td style="padding:10px 0 0;border-top:1px solid #e6dccd;text-align:right;font-weight:bold">${money(o.total)}</td></tr></table>
</div>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#231f1a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold">See your order</a></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#6b6157">${s.address ? `${esc(s.address)}<br>` : ""}${
    s.phone ? `<a href="tel:+1${tel}" style="color:#8a5a3b">${esc(s.phone)}</a>` : ""
  }</p>
</div></body></html>`;
  const text = [
    headline,
    body.replace(/<[^>]+>/g, ""),
    `Order code: ${code}`,
    ...o.items.map((i) => `${i.quantity} x ${i.nameSnapshot}${i.notes ? ` (${i.notes})` : ""}  ${money(i.lineTotal)}`),
    `Total: ${money(o.total)}`,
    `See your order: ${link}`,
    [s.address, s.phone].filter(Boolean).join(" · "),
  ].join("\n");

  return { subject, html, text, sms: sms.slice(0, 300) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers (plain HTTPS, no extra packages)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendEmail(m: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const { from } = emailStatus();
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const base = process.env.TWILIO_API_URL || "https://api.twilio.com";
  const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
