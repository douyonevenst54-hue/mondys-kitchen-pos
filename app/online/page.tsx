import { redirect } from "next/navigation";
import { getStaffFromSession } from "@/lib/staff";
import { getOnlineQueue, getOnlineStatus } from "@/lib/online-orders";
import { OnlineQueue } from "@/components/online/OnlineQueue";
import { getReaderInfo } from "@/lib/terminal";

export default async function OnlineQueuePage() {
  const staff = await getStaffFromSession();
  if (!staff) redirect("/login");

  const [orders, { settings, state }, reader] = await Promise.all([
    getOnlineQueue(),
    getOnlineStatus(),
    getReaderInfo({ live: true }).catch(() => null),
  ]);

  return (
    <OnlineQueue
      initial={orders}
      timezone={settings.timezone}
      acceptingOrders={state.open}
      closedMessage={state.open ? null : state.message}
      canManage={staff.role === "OWNER" || staff.role === "MANAGER"}
      reader={{ paired: Boolean(reader?.paired), simulated: Boolean(reader?.simulated) }}
    />
  );
}
