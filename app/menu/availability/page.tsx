import { redirect } from "next/navigation";
import { getMenuForCashier } from "@/lib/menu";
import { getManagerFromSession } from "@/lib/staff";
import { AvailabilityBoard } from "@/components/menu/AvailabilityBoard";

export default async function MenuAvailabilityPage() {
  // Role comes from the database, not the cookie.
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const categories = await getMenuForCashier();

  return (
    <AvailabilityBoard
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          isAvailable: i.isAvailable,
        })),
      }))}
    />
  );
}
