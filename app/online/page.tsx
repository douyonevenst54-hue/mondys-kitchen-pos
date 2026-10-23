import { redirect } from "next/navigation";
import { getStaffFromSession } from "@/lib/staff";
import { getOnlineQueue, getOnlineStatus } from "@/lib/online-orders";
import { OnlineQueue } from "@/components/online/OnlineQueue";
import { getReaderInfo } from "@/lib/terminal";
import { confirmCloverPayments } from "@/lib/clover";
import { confirmSquarePayments } from "@/lib/square-online";
import { registerSquareInfo } from "@/lib/square-register";
import { countNewMessages } from "@/lib/messages";
import { sweepRecentVoids } from "@/lib/notify";

export default async function OnlineQueuePage() {
  const staff = await getStaffFromSession();
  if (!staff) redirect("/login");

  await confirmSquarePayments().catch(() => 0);
  await confirmCloverPayments().catch(() => 0);
  sweepRecentVoids();
  const [orders, { settings, state }, reader, sq] = await Promise.all([
    getOnlineQueue(),
    getOnlineStatus(),
    getReaderInfo({ live: true }).catch(() => null),
    registerSquareInfo(),
  ]);

  return (
    <OnlineQueue
      initial={orders}
      timezone={settings.timezone}
      acceptingOrders={state.open}
      closedMessage={state.open ? null : state.message}
      canManage={staff.role === "OWNER" || staff.role === "MANAGER"}
      reader={{ paired: Boolean(reader?.paired), simulated: Boolean(reader?.simulated) }}
      squareTerminal={sq.ready}
      newMessages={staff.role === "OWNER" || staff.role === "MANAGER" ? await countNewMessages() : 0}
    />
  );
}
