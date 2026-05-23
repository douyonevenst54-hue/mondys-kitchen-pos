import "server-only";
import { prisma } from "@/lib/prisma";

export type MenuItemWithModifiers = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  categoryId: string;
  hasSpiceModifier: boolean;
};

export type CategoryWithItems = {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItemWithModifiers[];
};

/**
 * Loads the full menu for the cashier UI: every active category with its
 * active items. Items keep their `isAvailable` flag so the UI can show
 * a "Sold Out" overlay rather than hiding them.
 *
 * Prices come out of Prisma as Decimal — we convert to number here so the
 * client doesn't need to import the Decimal lib. Safe for prices up to
 * ~Number.MAX_SAFE_INTEGER / 100, far beyond any menu item.
 */
export async function getMenuForCashier(): Promise<CategoryWithItems[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      menuItems: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          modifierGroups: {
            include: { modifierGroup: { select: { name: true } } },
          },
        },
      },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    items: c.menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      isAvailable: item.isAvailable,
      categoryId: item.categoryId,
      hasSpiceModifier: item.modifierGroups.some(
        (mg) => mg.modifierGroup.name === "Spice Level",
      ),
    })),
  }));
}

export async function getSettings() {
  const settings = await prisma.restaurantSettings.findFirst();
  return {
    taxRate: settings ? Number(settings.taxRate) : 0.0625,
    currency: settings?.currency ?? "USD",
    name: settings?.name ?? "Mondy's Kitchen",
  };
}

export async function getActiveTables() {
  return prisma.table.findMany({
    where: { isActive: true },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      label: true,
      capacity: true,
      status: true,
    },
  });
}
