import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { refreshOnlineOrder } from "@/app/order/actions";
import { getSettings } from "@/lib/menu";
import { OrderStatusView } from "@/components/online/OrderStatusView";

export const metadata: Metadata = {
  title: "Your order · Mondy's Kitchen",
  robots: { index: false },
};

type Params = Promise<{ id: string }>;

export default async function OrderStatusPage({ params }: { params: Params }) {
  const { id } = await params;
  const [order, settings] = await Promise.all([refreshOnlineOrder(id), getSettings()]);
  if (!order) notFound();

  return (
    <OrderStatusView
      initial={order}
      restaurant={{ name: settings.name, address: settings.address, phone: settings.phone }}
      timezone={settings.timezone}
    />
  );
}
