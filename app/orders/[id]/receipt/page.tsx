import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getOrderDetail } from "@/lib/orders";
import { getSettings } from "@/lib/menu";
import { resolveLogoUrl } from "@/lib/logo";
import { ReceiptView } from "@/components/orders/ReceiptView";

type Session = { staffId: string; name: string; role: string };

async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

type Params = Promise<{ id: string }>;

export default async function ReceiptPage({ params }: { params: Params }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [order, settings] = await Promise.all([
    getOrderDetail(id),
    getSettings(),
  ]);
  if (!order) notFound();

  const logoUrl = resolveLogoUrl();

  return <ReceiptView order={order} settings={settings} logoUrl={logoUrl} />;
}