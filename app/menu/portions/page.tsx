import { redirect } from "next/navigation";
import { getMenuForManager } from "@/lib/menu";
import { getManagerFromSession } from "@/lib/staff";
import { PortionsBoard } from "@/components/menu/PortionsBoard";

export default async function PortionsPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const categories = await getMenuForManager();

  return (
    <PortionsBoard
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          portionsLeft: i.portionsLeft,
        })),
      }))}
    />
  );
}
