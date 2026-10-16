import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getStaffFromSession } from "@/lib/staff";
import { getKitchenBoard } from "@/lib/kitchen";
import { getSettings } from "@/lib/menu";
import { KitchenDisplay } from "@/components/kitchen/KitchenDisplay";

export const metadata: Metadata = { title: "Kitchen · Rosewood Cafe", robots: { index: false } };

export default async function KitchenPage() {
  await connection();
  const staff = await getStaffFromSession();
  if (!staff) redirect("/login");
  const [board, settings] = await Promise.all([getKitchenBoard(), getSettings()]);
  return <KitchenDisplay initial={board} timezone={settings.timezone} />;
}
