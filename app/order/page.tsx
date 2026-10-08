import type { Metadata } from "next";
import { connection } from "next/server";
import { getOnlineMenu, getOnlineStatus, PAY_AT_PICKUP_LIMIT } from "@/lib/online-orders";
import { resolveLogoUrl } from "@/lib/logo";
import { OnlineOrderApp } from "@/components/online/OnlineOrderApp";

export const metadata: Metadata = {
  title: "Order online · Rosewood Cafe by Mondy's",
  description: "Order breakfast, bowls, grill favorites, coffee and smoothies from Rosewood Cafe by Mondy's for pickup.",
};

export default async function OrderPage() {
  // Menu and open/closed state must be live, never a build-time snapshot.
  await connection();
  const [menu, { settings, state }] = await Promise.all([getOnlineMenu(), getOnlineStatus()]);

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
      cardEnabled={Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)}
      logoUrl={resolveLogoUrl()}
    />
  );
}
