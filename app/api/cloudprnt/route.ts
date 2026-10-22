import { prisma } from "@/lib/prisma";
import { cloudPrntToken } from "@/lib/print-queue";

/**
 * Star CloudPRNT endpoint (the receipt printer calls this, not a person).
 *   POST   printer checks in: "anything to print?"
 *   GET    printer downloads the job
 *   DELETE printer confirms it printed (or GET with &delete / &code)
 * The URL carries a secret token; anything else gets 403.
 */

const MEDIA = ["application/vnd.star.starprnt", "text/plain"];

function authorized(req: Request): boolean {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return t.length > 0 && t === cloudPrntToken();
}

/** Oldest job still waiting (jobs older than an hour or failed 3 times are dropped). */
async function nextJob() {
  return prisma.printJob.findFirst({
    where: { printedAt: null, attempts: { lt: 3 }, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    orderBy: { createdAt: "asc" },
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { printerMAC?: string; statusCode?: string };
  const mac = typeof body.printerMAC === "string" ? body.printerMAC.slice(0, 40) : null;
  const s = await prisma.restaurantSettings.findFirst({ select: { id: true } });
  if (s) await prisma.restaurantSettings.update({ where: { id: s.id }, data: { receiptPrinterMac: mac, receiptPrinterSeenAt: new Date() } });
  const job = await nextJob();
  return Response.json(job ? { jobReady: true, mediaTypes: MEDIA, jobToken: job.id } : { jobReady: false });
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  if (p.has("delete") || p.has("code")) return confirm(p);
  const token = p.get("token");
  const job = token ? await prisma.printJob.findUnique({ where: { id: token } }) : await nextJob();
  if (!job || job.printedAt) return new Response("No job", { status: 404 });
  await prisma.printJob.update({ where: { id: job.id }, data: { sentAt: new Date(), attempts: { increment: 1 } } });
  const type = p.get("type") === "text/plain" ? "text/plain" : "application/vnd.star.starprnt";
  if (type === "text/plain") {
    return new Response(`${job.content}\n\n\n\n`, { headers: { "Content-Type": "text/plain; charset=us-ascii", "X-Star-Cut": "partial; feed=true" } });
  }
  return new Response(starPrnt(job.content), { headers: { "Content-Type": "application/vnd.star.starprnt" } });
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  return confirm(new URL(req.url).searchParams);
}

async function confirm(p: URLSearchParams): Promise<Response> {
  const token = p.get("token");
  const job = token ? await prisma.printJob.findUnique({ where: { id: token } }) : await prisma.printJob.findFirst({ where: { printedAt: null, sentAt: { not: null } }, orderBy: { sentAt: "desc" } });
  if (!job) return new Response("OK");
  const code = (p.get("code") ?? "200").trim();
  if (code.startsWith("2")) await prisma.printJob.update({ where: { id: job.id }, data: { printedAt: new Date(), error: null } });
  else await prisma.printJob.update({ where: { id: job.id }, data: { error: code.slice(0, 100) } });
  return new Response("OK");
}

/** Plain lines → StarPRNT bytes: reset, centered bold first line, text, feed and cut. */
function starPrnt(text: string): ArrayBuffer {
  const ESC = 0x1b;
  const lines = text.split("\n");
  const out: number[] = [ESC, 0x40]; // initialize
  const enc = (s: string) => Array.from(s, (c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 0x3f));
  lines.forEach((line, i) => {
    if (i === 0) out.push(ESC, 0x45); // bold on for the business name
    out.push(...enc(line), 0x0a);
    if (i === 0) out.push(ESC, 0x46); // bold off
  });
  out.push(ESC, 0x64, 0x03); // feed and partial cut
  return Uint8Array.from(out).buffer;
}
