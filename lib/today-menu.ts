import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/menu";
import { isSoldOut, needsPrice, servedOn, weekdayIn } from "@/lib/menu-visibility";

/**
 * The "Today's menu" screen: every dish is either ON TODAY (shown on the
 * register and/or the online menu, and on today's schedule) or in the DISH
 * LIBRARY (kept, hidden, one tap to bring back).
 */

export type EditableOption = { id: string; name: string; price: number };
export type EditableGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  free: number;
  sharedWith: number; // other dishes using the same choices
  options: EditableOption[];
};

export type TodayDish = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  number: number | null;
  sectionId: string;
  onToday: boolean;
  onlyOn: "register" | "online" | null; // shown on one channel only (set in Daily menu)
  soldOut: boolean;
  needsPrice: boolean;
  imageUrl: string | null;
  groups: EditableGroup[];
};

export type TodaySection = { id: string; name: string; dishes: TodayDish[] };

export async function getTodayMenu(): Promise<{ sections: TodaySection[]; weekday: number }> {
  const settings = await getSettings();
  const weekday = weekdayIn(settings.timezone);
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      menuItems: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroup: {
                include: {
                  modifiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                  _count: { select: { menuItems: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    weekday,
    sections: categories.map((c) => ({
      id: c.id,
      name: c.name,
      dishes: c.menuItems.map((i) => {
        const shown = i.showOnRegister || i.showOnline;
        return {
          id: i.id,
          name: i.name,
          description: i.description,
          price: Number(i.price),
          number: i.menuNumber,
          sectionId: c.id,
          onToday: shown && servedOn(i.serveDays, weekday),
          onlyOn: shown && !(i.showOnRegister && i.showOnline) ? (i.showOnRegister ? "register" : "online") : null,
          soldOut: isSoldOut(i),
          needsPrice: needsPrice(i),
          imageUrl: i.imageUrl,
          groups: i.modifierGroups
            .filter((l) => l.modifierGroup.isActive)
            .map((l) => ({
              id: l.modifierGroup.id,
              name: l.modifierGroup.name,
              min: l.modifierGroup.minSelect,
              max: l.modifierGroup.maxSelect,
              free: l.modifierGroup.freeChoices,
              sharedWith: Math.max(0, l.modifierGroup._count.menuItems - 1),
              options: l.modifierGroup.modifiers.map((m) => ({ id: m.id, name: m.name, price: Number(m.priceAdjustment) })),
            })),
        };
      }),
    })),
  };
}
