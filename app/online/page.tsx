import { redirect } from "next/navigation";
import { getStaffFromSession } from "@/lib/staff";
import { getOnlineQueue, getOnlineStatus } from "@/lib/online-orders";
import { OnlineQueue } from "@/components/online/OnlineQueue";
import { getReaderInfo } from "@/lib/terminal";
import { confirmCloverPayments } from "@/lib/clover";
import { countNewMessages } from "@/lib/messages";

export default async function OnlineQueuePage() {
  const staff = await getStaffFromSession();
  if (!staff) redirect("/login");

  await confirmCloverPayments().catch(() => 0);
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
      newMessages={staff.role === "OWNER" || staff.role === "MANAGER" ? await countNewMessages() : 0}
    />
  );
}
