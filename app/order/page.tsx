import type { Metadata } from "next";
import { connection } from "next/server";
import { getOnlineMenu, getOnlineStatus, PAY_AT_PICKUP_LIMIT } from "@/lib/online-orders";
import { resolveLogoUrl } from "@/lib/logo";
import { getCardStatus } from "@/lib/stripe-config";
import { onlineCardProvider } from "@/lib/card-provider";
import { getLiveAnnouncements } from "@/lib/announcements";
import { pickupDays } from "@/lib/online-hours";
import { smsStatus } from "@/lib/notify";
import { activeBanners } from "@/lib/promotions";
import { getBrand } from "@/lib/brand";
import { OnlineOrderApp } from "@/components/online/OnlineOrderApp";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: "Order online", description: `Order from ${brand.name} for pickup.` };
}

export default async function OrderPage() {
  // Menu and open/closed state must be live, never a build-time snapshot.
  await connection();
  const [menu, { settings, state }] = await Promise.all([getOnlineMenu(), getOnlineStatus()]);
  const [clubPosts, promos] = await Promise.all([getLiveAnnouncements(settings.timezone), activeBanners()]);
  const card = getCardStatus();
  // Square first (the restaurant's own processor), then Clover, then Stripe.
  const cardProvider = onlineCardProvider();
  if (!cardProvider) console.warn(`Online card payments are off: ${card.enabled ? "no provider" : card.problem}`);
  const days = settings.onlineOrderingPaused
    ? []
    : pickupDays({
        businessHours: settings.businessHours,
        timezone: settings.timezone,
        prepMinutes: settings.onlinePrepTimeMinutes,
        openNow: state.open,
        allowPreorders: settings.allowPreorders,
      });

  return (
    <OnlineOrderApp
      menu={menu}
      restaurant={{
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        prepMinutes: settings.onlinePrepTimeMinutes,
        taxRate: settings.taxRate,
      }}
      openState={state}
      payAtPickupLimit={PAY_AT_PICKUP_LIMIT}
      cardEnabled={cardProvider !== null}
      cardProvider={cardProvider}
      stripeKey={card.publishableKey}
      logoUrl={resolveLogoUrl()}
      clubPosts={clubPosts}
      pickupDays={days}
      textUpdates={smsStatus().enabled}
      promos={promos}
    />
  );
}
