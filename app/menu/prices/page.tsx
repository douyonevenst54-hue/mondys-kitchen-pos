import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { PriceEditor } from "@/components/menu/PriceEditor";

export default async function PricesPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const [categories, groups] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        menuItems: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, price: true, menuNumber: true, showOnRegister: true, showOnline: true },
        },
      },
    }),
    prisma.modifierGroup.findMany({
      where: { isActive: true, menuItems: { some: { menuItem: { isActive: true } } } },
      orderBy: { sortOrder: "asc" },
      include: {
        modifiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        menuItems: { where: { menuItem: { isActive: true } }, select: { menuItem: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <PriceEditor
      categories={categories
        .filter((c) => c.menuItems.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          items: c.menuItems.map((i) => ({
            id: i.id,
            name: i.name,
            number: i.menuNumber,
            price: Number(i.price),
            hidden: !i.showOnRegister && !i.showOnline,
          })),
        }))}
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        usedBy: g.menuItems.map((m) => m.menuItem.name),
        free: g.freeChoices,
        options: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: Number(m.priceAdjustment) })),
      }))}
    />
  );
}
