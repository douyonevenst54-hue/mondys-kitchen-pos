import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMenuForCashier, getSettings, getActiveTables } from "@/lib/menu";
import { CashierShell } from "@/components/cashier/CashierShell";
import { logout } from "@/app/login/actions";
import { resolveLogoUrl } from "@/lib/logo";
import { getCurrentShift } from "@/app/api/orders/actions";
import { verifySession } from "@/lib/session";
import { countNewMessages } from "@/lib/messages";

type Session = { staffId: string; name: string; role: string };

async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;
  try {
    return await verifySession(raw);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Parallel-fetch everything the cashier needs at boot.
  const [categories, tables, settings, currentShift] = await Promise.all([
    getMenuForCashier(),
    getActiveTables(),
    getSettings(),
    getCurrentShift(session.staffId),
  ]);
  const logoUrl = resolveLogoUrl();
  const isManager = session.role === "OWNER" || session.role === "MANAGER";
  const newMessages = isManager ? await countNewMessages() : 0;

  return (
    <CashierShell
      categories={categories}
      tables={tables}
      taxRate={settings.taxRate}
      defaultDeliveryFee={settings.defaultDeliveryFee}
      staffId={session.staffId}
      staffName={session.name}
      staffRole={session.role}
      signOutAction={logout}
      logoUrl={logoUrl}
      hasOpenShift={Boolean(currentShift)}
      shiftStartedAt={currentShift?.startedAt ?? null}
      newMessages={newMessages}
    />
  );
}