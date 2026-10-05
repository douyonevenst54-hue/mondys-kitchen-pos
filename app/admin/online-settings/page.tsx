import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/menu";
import { OnlineSettingsForm } from "@/components/admin/OnlineSettingsForm";

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

export default async function OnlineSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "MANAGER" && session.role !== "OWNER") {
    redirect("/");
  }

  const settings = await getSettings();

  return (
    <OnlineSettingsForm
      paused={settings.onlineOrderingPaused}
      businessHours={settings.businessHours}
      prepTimeMinutes={settings.onlinePrepTimeMinutes}
    />
  );
}