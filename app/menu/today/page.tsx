import { redirect } from "next/navigation";
import { getManagerFromSession } from "@/lib/staff";
import { getTodayMenu } from "@/lib/today-menu";
import { WEEK } from "@/lib/menu-visibility";
import { TodayMenuBoard } from "@/components/menu/TodayMenuBoard";

export default async function TodayMenuPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const { sections, weekday } = await getTodayMenu();
  return <TodayMenuBoard sections={sections} dayName={WEEK.find((d) => d.day === weekday)?.long ?? "Today"} />;
}
