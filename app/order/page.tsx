import type { Metadata } from "next";
import { connection } from "next/server";
import { getOnlineMenu, getOnlineStatus, PAY_AT_PICKUP_LIMIT } from "@/lib/online-orders";
import { resolveLogoUrl } from "@/lib/logo";
import { getCardStatus } from "@/lib/stripe-config";
import { getCloverStatus } from "@/lib/clover";
import { getLiveAnnouncements } from "@/lib/announcements";
import { OnlineOrderApp } from "@/components/online/OnlineOrderApp";

export const metadata: Metadata = {
  title: "Order online · Rosewood Cafe by Mondy's",
  description: "Order breakfast, bowls, grill favorites, coffee and smoothies from Rosewood Cafe by Mondy's for pickup.",
};

export default async function OrderPage() {
  // Menu and open/closed state must be live, never a build-time snapshot.
  await connection();
  const [menu, { settings, state }] = await Promise.all([getOnlineMenu(), getOnlineStatus()]);
  const clubPosts = await getLiveAnnouncements(settings.timezone);
  const card = getCardStatus();
  // The restaurant's Clover account comes first; Stripe is the fallback.
  const cardProvider = getCloverStatus().enabled ? "clover" : card.enabled ? "stripe" : null;
  if (!cardProvider && !card.enabled) console.warn(`Online card payments are off: ${card.problem}`);

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
    />
  );
}
