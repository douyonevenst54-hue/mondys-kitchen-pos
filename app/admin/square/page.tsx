import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { squareOnlineEnabled, squareStatus, squareWebhookConfigured } from "@/lib/square";
import { registerSquareInfo } from "@/lib/square-register";
import { onlineCardProvider, PROVIDER_NAME } from "@/lib/card-provider";
import { getCloverStatus } from "@/lib/clover";
import { siteUrl } from "@/lib/notify";
import { SquareSettings } from "@/components/admin/SquareSettings";

export const metadata: Metadata = { title: "Square setup" };

export default async function SquarePage() {
  await connection();
  if (!(await getManagerFromSession())) redirect("/");
  const st = squareStatus();
  const [register, kiosk] = await Promise.all([
    registerSquareInfo(),
    prisma.restaurantSettings.findFirst({ select: { squareDeviceId: true, squareDeviceName: true, kioskPayment: true } }),
  ]);
  const provider = onlineCardProvider();
  return (
    <SquareSettings
      square={{ enabled: st.enabled, sandbox: st.sandbox, problem: st.problem }}
      register={{ enabled: st.enabled, sandbox: st.sandbox, problem: st.problem, deviceId: register.deviceId, deviceName: register.deviceName }}
      kiosk={{
        paired: Boolean(kiosk?.squareDeviceId),
        name: kiosk?.squareDeviceName ?? null,
        usesSquare: kiosk?.kioskPayment === "square",
        sameAsRegister: Boolean(kiosk?.squareDeviceId && kiosk.squareDeviceId === register.deviceId),
      }}
      online={{
        provider: provider ? PROVIDER_NAME[provider] : null,
        squareOff: st.enabled && !squareOnlineEnabled(),
        webhook: squareWebhookConfigured(),
        webhookUrl: (process.env.SQUARE_WEBHOOK_URL ?? "").trim() || `${siteUrl()}/api/square/webhook`,
      }}
      cloverStillSet={getCloverStatus().enabled}
    />
  );
}
