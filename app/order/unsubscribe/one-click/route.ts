import { checkUnsubscribeToken, optOut } from "@/lib/campaigns";

/** One-click unsubscribe from the mail app (RFC 8058). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!checkUnsubscribeToken(u, t)) return new Response("Invalid link", { status: 400 });
  await optOut(u);
  return new Response("Unsubscribed", { status: 200 });
}
