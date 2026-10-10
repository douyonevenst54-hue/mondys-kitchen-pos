import { redirect } from "next/navigation";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { getAllAnnouncements } from "@/lib/announcements";
import { businessDate } from "@/lib/business-date";
import { ClubBoard } from "@/components/club/ClubBoard";

export default async function ClubPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const settings = await getSettings();
  const posts = await getAllAnnouncements(settings.timezone);

  return <ClubBoard posts={posts} today={businessDate(settings.timezone)} />;
}
