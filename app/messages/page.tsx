import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { MessagesBoard } from "@/components/admin/MessagesBoard";

export default async function MessagesPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const [rows, settings] = await Promise.all([
    prisma.customerMessage.findMany({
      orderBy: [{ isHandled: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    getSettings(),
  ]);

  return (
    <MessagesBoard
      timezone={settings.timezone}
      messages={rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        name: m.name,
        phone: m.phone,
        email: m.email,
        message: m.message,
        eventDate: m.eventDate,
        guests: m.guests,
        rating: m.rating,
        orderCode: m.orderCode,
        isHandled: m.isHandled,
        handledBy: m.handledBy,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
