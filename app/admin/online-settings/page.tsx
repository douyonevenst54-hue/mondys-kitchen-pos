import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/menu";
import { OnlineSettingsForm } from "@/components/admin/OnlineSettingsForm";
import { verifySession } from "@/lib/session";
import { getCardStatus, webhookConfigured } from "@/lib/stripe-config";
import { getCloverStatus } from "@/lib/clover";
import { emailStatus, smsStatus } from "@/lib/notify";

export const metadata: Metadata = { title: "Online settings" };

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

export default async function OnlineSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "MANAGER" && session.role !== "OWNER") {
    redirect("/");
  }

  const settings = await getSettings();
  const card = getCardStatus();
  const clover = getCloverStatus();

  return (
    <OnlineSettingsForm
      details={{ phone: settings.phone, address: settings.address, email: settings.email }}
      paused={settings.onlineOrderingPaused}
      businessHours={settings.businessHours}
      prepTimeMinutes={settings.onlinePrepTimeMinutes}
      allowPreorders={settings.allowPreorders}
      notify={{ email: emailStatus(), sms: smsStatus() }}
      card={
        clover.enabled
          ? { provider: "Clover", enabled: true, mode: clover.env === "sandbox" ? "test" : "live", problem: null, webhook: clover.webhook }
          : {
              provider: "Stripe",
              enabled: card.enabled,
              mode: card.enabled ? card.mode : null,
              problem: card.enabled ? null : card.problem,
              webhook: webhookConfigured(),
            }
      }
    />
  );
}