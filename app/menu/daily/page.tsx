import { redirect } from "next/navigation";
import { getMenuForManager, getSettings } from "@/lib/menu";
import { getManagerFromSession } from "@/lib/staff";
import { weekdayIn } from "@/lib/menu-visibility";
import { DailyMenuBoard } from "@/components/menu/DailyMenuBoard";

export default async function DailyMenuPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const [categories, settings] = await Promise.all([getMenuForManager(), getSettings()]);

  return (
    <DailyMenuBoard
      today={weekdayIn(settings.timezone)}
      hideSoldOut={{ register: settings.hideSoldOutOnRegister, online: settings.hideSoldOutOnline }}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          soldOut: i.soldOut,
          needsPrice: i.needsPrice,
          showOnRegister: i.showOnRegister,
          showOnline: i.showOnline,
          serveDays: i.serveDays,
        })),
      }))}
    />
  );
}
