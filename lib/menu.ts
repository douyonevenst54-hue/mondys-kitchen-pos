import "server-only";
import { prisma } from "@/lib/prisma";
import { isListed, isSoldOut, needsPrice, servedOn, weekdayIn } from "@/lib/menu-visibility";
import { optionGroupsInclude, toOptionGroups } from "@/lib/options-db";
import type { OptionGroup } from "@/lib/options";

export type MenuItemWithModifiers = {
  id: string;
  name: string;
  description: string | null;
  menuNumber: number | null;
  isSignature: boolean;
  price: number;
  isAvailable: boolean;
  portionsLeft: number | null;
  categoryId: string;
  optionGroups: OptionGroup[];
};

export type CategoryWithItems = {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItemWithModifiers[];
};

export type ManagedMenuItem = MenuItemWithModifiers & {
  showOnRegister: boolean;
  showOnline: boolean;
  serveDays: number;
  servedToday: boolean;
  soldOut: boolean;
  needsPrice: boolean;
};

export type ManagedCategory = {
  id: string;
  name: string;
  sortOrder: number;
  items: ManagedMenuItem[];
};

type LoadedItem = Awaited<ReturnType<typeof loadMenu>>[number]["menuItems"][number];

function baseItem(item: LoadedItem): MenuItemWithModifiers {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    menuNumber: item.menuNumber,
    isSignature: item.isSignature,
    price: Number(item.price),
    isAvailable: item.isAvailable,
    portionsLeft: item.portionsLeft,
    categoryId: item.categoryId,
    optionGroups: toOptionGroups(item.modifierGroups),
  };
}

async function loadMenu() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      menuItems: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: optionGroupsInclude,
      },
    },
  });
}

/**
 * Every active dish, including hidden and off-schedule ones. For the manager
 * screens (Daily menu, Sold-out list, Portion counts).
 */
export async function getMenuForManager(): Promise<ManagedCategory[]> {
  const [categories, settings] = await Promise.all([loadMenu(), getSettings()]);
  const weekday = weekdayIn(settings.timezone);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    items: c.menuItems.map((item) => ({
      ...baseItem(item),
      isAvailable: item.isAvailable,
      showOnRegister: item.showOnRegister,
      showOnline: item.showOnline,
      serveDays: item.serveDays,
      servedToday: servedOn(item.serveDays, weekday),
      soldOut: isSoldOut(item),
      needsPrice: needsPrice(item),
    })),
  }));
}

/**
 * The register menu: only dishes on today's menu and not hidden by a manager.
 * Sold-out dishes stay listed (greyed out) unless the restaurant chose to hide
 * them.
 */
export async function getMenuForCashier(): Promise<CategoryWithItems[]> {
  const [categories, settings] = await Promise.all([loadMenu(), getSettings()]);
  const weekday = weekdayIn(settings.timezone);

  return categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      items: c.menuItems
        .filter((item) => isListed(item, "register", weekday, settings.hideSoldOutOnRegister))
        .map((item) => ({ ...baseItem(item), isAvailable: !isSoldOut(item) })),
    }))
    .filter((c) => c.items.length > 0);
}

export async function getSettings() {
  const settings = await prisma.restaurantSettings.findFirst();
  // Defensive fallback: even if the column exists, the value may be null on
  // pre-existing rows that were created before the column was added.
  const rawDeliveryFee = settings?.defaultDeliveryFee;
  const defaultDeliveryFee =
    rawDeliveryFee != null && !isNaN(Number(rawDeliveryFee))
      ? Number(rawDeliveryFee)
      : 5.0;

  // Business hours — JSON column, may be null on existing rows.
  // Shape: { monday: "11:00-21:00", tuesday: null, ... } where null = closed that day.
  const businessHours =
    (settings?.businessHours as Record<string, string | null> | null) ?? null;

  return {
    name: settings?.name ?? "Rosewood Cafe by Mondy's",
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
    taxRate: settings ? Number(settings.taxRate) : 0.0625,
    currency: settings?.currency ?? "USD",
    receiptFooter:
      settings?.receiptFooter ?? "Thank you for visiting Rosewood Cafe by Mondy's!",
    timezone: settings?.timezone ?? "America/New_York",
    defaultDeliveryFee,
    // Online ordering
    onlineOrderingPaused: settings?.onlineOrderingPaused ?? false,
    businessHours,
    onlinePrepTimeMinutes: settings?.onlinePrepTimeMinutes ?? 20,
    // Sold-out display (false = still show, marked sold out)
    hideSoldOutOnRegister: settings?.hideSoldOutOnRegister ?? false,
    hideSoldOutOnline: settings?.hideSoldOutOnline ?? false,
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