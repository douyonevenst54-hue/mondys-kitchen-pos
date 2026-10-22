import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { squareStatus } from "@/lib/square";
import { kioskMode } from "@/lib/kiosk";
import { cloudPrntUrl, printerStatus } from "@/lib/print-queue";
import { SelfCheckoutSettings } from "@/components/admin/SelfCheckoutSettings";

export const metadata: Metadata = { title: "Self-checkout setup" };

export default async function SelfCheckoutPage() {
  await connection();
  if (!(await getManagerFromSession())) redirect("/");
  const [s, mode, printer, stickered] = await Promise.all([
    prisma.restaurantSettings.findFirst({ select: { kioskPayment: true, kioskAutoPrint: true, squareDeviceId: true, squareDeviceName: true, cardReaderId: true, cardReaderLabel: true } }),
    kioskMode(),
    printerStatus(),
    prisma.menuItem.count({ where: { isActive: true, barcode: { not: null } } }),
  ]);
  const sq = squareStatus();
  return (
    <SelfCheckoutSettings
      payment={s?.kioskPayment ?? "counter"}
      autoPrint={s?.kioskAutoPrint ?? true}
      activeMode={mode.mode}
      modeProblem={mode.problem}
      square={{ enabled: sq.enabled, sandbox: sq.sandbox, problem: sq.problem, deviceId: s?.squareDeviceId ?? null, deviceName: s?.squareDeviceName ?? null }}
      stripeReader={s?.cardReaderId ? (s.cardReaderLabel ?? "Stripe reader") : null}
      printer={{ ...printer, url: cloudPrntUrl() }}
      stickered={stickered}
    />
  );
}
