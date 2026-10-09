import "server-only";
import type { Prisma } from "@prisma/client";
import type { OptionGroup } from "@/lib/options";

/** Prisma `include` that loads a dish's choices in the order to ask them. */
export const optionGroupsInclude = {
  modifierGroups: {
    orderBy: { sortOrder: "asc" },
    include: {
      modifierGroup: {
        include: { modifiers: { where: { isActive: true, isAvailable: true }, orderBy: { sortOrder: "asc" } } },
      },
    },
  },
} satisfies Prisma.MenuItemInclude;

type LinkRow = {
  modifierGroup: {
    id: string;
    name: string;
    isActive: boolean;
    minSelect: number;
    maxSelect: number;
    freeChoices: number;
    modifiers: { id: string; name: string; priceAdjustment: Prisma.Decimal | number }[];
  };
};

export function toOptionGroups(links: LinkRow[]): OptionGroup[] {
  return links
    .filter((l) => l.modifierGroup.isActive && l.modifierGroup.modifiers.length > 0)
    .map((l) => {
      const g = l.modifierGroup;
      const options = g.modifiers.map((m) => ({ id: m.id, name: m.name, price: Number(m.priceAdjustment) }));
      return {
        id: g.id,
        name: g.name,
        // Never require more picks than there are options left (one may be switched off).
        min: Math.min(g.minSelect, options.length),
        max: Math.max(1, Math.min(g.maxSelect, options.length)),
        free: Math.max(0, g.freeChoices),
        options,
      };
    });
}

/** Choices for several dishes at once (used by both checkouts). */
export async function loadOptionGroups(
  tx: Prisma.TransactionClient,
  menuItemIds: string[],
): Promise<Map<string, OptionGroup[]>> {
  const rows = await tx.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, ...optionGroupsInclude },
  });
  return new Map(rows.map((r) => [r.id, toOptionGroups(r.modifierGroups)]));
}
