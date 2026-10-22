import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { kioskMode } from "@/lib/kiosk";
import { printerStatus } from "@/lib/print-queue";
import { emailStatus } from "@/lib/notify";
import { stripeTestMode } from "@/lib/stripe";
import { resolveLogoUrl } from "@/lib/logo";
import { KioskApp } from "@/components/kiosk/KioskApp";

export const metadata: Metadata = { title: "Self-checkout" };

export default async function KioskPage() {
  const staff = await getStaffFromSession();
  if (!staff) redirect("/login");
  const [settings, mode, printer] = await Promise.all([getSettings(), kioskMode(), printerStatus()]);
  return (
    <KioskApp
      mode={mode.mode}
      taxRate={settings.taxRate}
      autoPrint={mode.autoPrint}
      canPrint={Boolean(printer.mac)}
      canEmail={emailStatus().enabled}
      testTap={mode.mode === "stripe" && stripeTestMode()}
      logoUrl={resolveLogoUrl()}
    />
  );
}
