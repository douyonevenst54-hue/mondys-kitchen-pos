import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { getBrand } from "@/lib/brand";

/** Width of an 80 mm receipt in the printer's standard font. */
export const RECEIPT_COLS = 42;

const money = (n: number) => `$${n.toFixed(2)}`;
/** Receipt printers only print plain ASCII reliably. */
const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e]/g, "");
const center = (s: string, w = RECEIPT_COLS) => {
  const t = ascii(s).slice(0, w);
  return " ".repeat(Math.floor((w - t.length) / 2)) + t;
};
const lr = (l: string, r: string, w = RECEIPT_COLS) => {
  const right = ascii(r);
  const left = ascii(l).slice(0, w - right.length - 1);
  return left + " ".repeat(Math.max(1, w - left.length - right.length)) + right;
};
function wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of ascii(s).split(/\s+/)) {
    if ((line + " " + word).trim().length > w) {
      if (line) out.push(line);
      line = word.slice(0, w);
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out;
}

/** A plain-text receipt for one order, ready for the receipt printer or an email. */
export async function receiptText(orderId: string): Promise<string | null> {
  const [o, s, brand] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        payments: { where: { status: "COMPLETED" } },
      },
    }),
    getSettings(),
    getBrand(),
  ]);
  if (!o) return null;
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: s.timezone }).format(o.completedAt ?? o.createdAt);
  const rule = "-".repeat(RECEIPT_COLS);
  const lines: string[] = [];
  lines.push(center(brand.wordmark.toUpperCase()));
  if (brand.tagline) lines.push(center(brand.tagline));
  if (s.address) lines.push(...wrap(s.address, RECEIPT_COLS).map((l) => center(l)));
  if (s.phone) lines.push(center(s.phone));
  lines.push("", lr(`Order #${o.orderNumber}`, when), o.source === "KIOSK" ? "Self-checkout" : "", rule);
  for (const it of o.items) {
    const name = `${it.quantity > 1 ? `${it.quantity} x ` : ""}${it.nameSnapshot}`;
    const [first, ...rest] = wrap(name, RECEIPT_COLS - 10);
    lines.push(lr(first ?? "", money(Number(it.lineTotal))));
    for (const r of rest) lines.push(`  ${r}`);
    if (it.notes) for (const n of wrap(it.notes, RECEIPT_COLS - 4)) lines.push(`  ${n}`);
  }
  lines.push(rule, lr("Subtotal", money(Number(o.subtotal))));
  if (Number(o.discountAmount) > 0) lines.push(lr("Discounts", `-${money(Number(o.discountAmount))}`));
  lines.push(lr(`Meals tax (${(s.taxRate * 100).toFixed(2)}%)`, money(Number(o.taxAmount))));
  if (Number(o.tipAmount) > 0) lines.push(lr("Tip", money(Number(o.tipAmount))));
  lines.push(lr("TOTAL", money(Number(o.total))));
  for (const p of o.payments) {
    const card = p.cardLast4 ? ` ${(p.cardBrand ?? "Card").toUpperCase()} ****${p.cardLast4}` : "";
    lines.push(lr(`Paid${p.method === "CASH" ? " cash" : card || " card"}`, money(Number(p.amount))));
  }
  lines.push("", ...wrap(s.receiptFooter, RECEIPT_COLS).map((l) => center(l)), "");
  return lines.filter((l, i) => !(l === "" && lines[i - 1] === "")).join("\n");
}
