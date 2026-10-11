"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { ALL_DAYS } from "@/lib/menu-visibility";

export type TodayResult = { ok: true; id?: string } | { ok: false; error: string };

const Id = z.string().min(1).max(64);
const Money = (max: number) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max)
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Use dollars and cents");

function refresh() {
  for (const p of ["/", "/order", "/menu/today", "/menu/daily", "/menu/prices", "/menu/availability", "/menu/photos", "/menu/portions"]) {
    revalidatePath(p);
  }
}

async function managerOnly(fn: () => Promise<TodayResult>): Promise<TodayResult> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can change the menu" };
  try {
    const res = await fn();
    if (res.ok) refresh();
    return res;
  } catch (e) {
    console.error("Today's menu change failed:", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/**
 * Put a dish on today's menu (register and online, every day until removed)
 * or take it off (it stays in the dish library).
 */
export async function setOnToday(itemId: string, on: boolean): Promise<TodayResult> {
  const p = z.object({ itemId: Id, on: z.boolean() }).safeParse({ itemId, on });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(async () => {
    await prisma.menuItem.update({
      where: { id: p.data.itemId },
      data: p.data.on
        ? { showOnRegister: true, showOnline: true, serveDays: ALL_DAYS }
        : { showOnRegister: false, showOnline: false },
    });
    return { ok: true };
  });
}

/** Start a fresh day: every dish goes back to the library. */
export async function clearToday(): Promise<TodayResult> {
  return managerOnly(async () => {
    await prisma.menuItem.updateMany({ where: { isActive: true }, data: { showOnRegister: false, showOnline: false } });
    return { ok: true };
  });
}

/** Remove a dish from the library for good (past orders keep their history). */
export async function deleteDish(itemId: string): Promise<TodayResult> {
  const p = Id.safeParse(itemId);
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(async () => {
    await prisma.menuItem.update({
      where: { id: p.data },
      data: { isActive: false, showOnRegister: false, showOnline: false },
    });
    return { ok: true };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create or edit a dish
// ─────────────────────────────────────────────────────────────────────────────

const Name = (what: string, max: number) =>
  z.string().trim().min(1, `Give the ${what} a name`).max(max, `Keep the ${what} name under ${max} characters`);

const GroupSchema = z
  .object({
    id: Id.optional(),
    name: Name("choice", 40),
    required: z.boolean(),
    pick: z.number().int().min(1).max(10),
    options: z
      .array(z.object({ id: Id.optional(), name: Name("option", 40), price: Money(99.99) }))
      .min(1, "Each choice needs at least one option")
      .max(20, "Up to 20 options per choice"),
  })
  .refine((g) => g.pick <= g.options.length, { message: "A choice can't ask for more picks than it has options" })
  .refine((g) => new Set(g.options.map((o) => o.name.toLowerCase())).size === g.options.length, {
    message: "Two options in the same choice have the same name",
  });

const DishSchema = z.object({
  id: Id.optional(),
  name: Name("dish", 80),
  description: z.string().trim().max(300, "Keep the description under 300 characters"),
  price: Money(999.99),
  section: z.union([z.object({ id: Id }), z.object({ newName: Name("section", 40) })]),
  onToday: z.boolean(),
  groups: z.array(GroupSchema).max(8, "Up to 8 choices per dish"),
});

export type DishInput = z.input<typeof DishSchema>;

export async function saveDish(input: DishInput): Promise<TodayResult> {
  const p = DishSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form" };
  const d = p.data;

  return managerOnly(() =>
    prisma.$transaction(async (tx) => {
      // Section: an existing one, or a new one at the top of the menu.
      let categoryId: string;
      if ("id" in d.section) {
        const cat = await tx.category.findUnique({ where: { id: d.section.id }, select: { id: true } });
        if (!cat) return { ok: false, error: "That section no longer exists" };
        categoryId = cat.id;
      } else {
        const existing = await tx.category.findFirst({
          where: { name: { equals: d.section.newName, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) {
          await tx.category.update({ where: { id: existing.id }, data: { isActive: true } });
          categoryId = existing.id;
        } else {
          const top = await tx.category.aggregate({ _min: { sortOrder: true } });
          const cat = await tx.category.create({
            data: { name: d.section.newName, sortOrder: (top._min.sortOrder ?? 1) - 1 },
          });
          categoryId = cat.id;
        }
      }

      // The dish itself.
      let itemId: string;
      if (d.id) {
        const found = await tx.menuItem.findFirst({ where: { id: d.id, isActive: true }, select: { id: true } });
        if (!found) return { ok: false, error: "That dish no longer exists" };
        await tx.menuItem.update({
          where: { id: d.id },
          data: { name: d.name, description: d.description || null, price: d.price, categoryId },
        });
        itemId = d.id;
      } else {
        const last = await tx.menuItem.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
        const item = await tx.menuItem.create({
          data: {
            name: d.name,
            description: d.description || null,
            price: d.price,
            categoryId,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            isAvailable: true,
            showOnRegister: d.onToday,
            showOnline: d.onToday,
            serveDays: ALL_DAYS,
          },
        });
        itemId = item.id;
      }

      // Choices. A choice used only by this dish is edited in place. A choice
      // shared with other dishes (e.g. "Size" on every coffee) is copied for
      // this dish first, so editing one dish never changes another.
      const links = await tx.menuItemModifierGroup.findMany({
        where: { menuItemId: itemId },
        include: { modifierGroup: { include: { modifiers: true, _count: { select: { menuItems: true } } } } },
      });
      const keep: string[] = [];
      for (const [gi, g] of d.groups.entries()) {
        const min = g.required ? g.pick : 0;
        const max = g.pick;
        const link = g.id ? links.find((l) => l.modifierGroupId === g.id) : undefined;
        const own = link && link.modifierGroup._count.menuItems === 1;

        let groupId: string;
        if (own && link) {
          const grp = link.modifierGroup;
          await tx.modifierGroup.update({
            where: { id: grp.id },
            data: { name: g.name, minSelect: min, maxSelect: max, isRequired: min > 0, isActive: true },
          });
          const seen = new Set<string>();
          for (const [oi, o] of g.options.entries()) {
            const existing = o.id ? grp.modifiers.find((m) => m.id === o.id) : undefined;
            if (existing) {
              seen.add(existing.id);
              await tx.modifier.update({
                where: { id: existing.id },
                data: { name: o.name, priceAdjustment: o.price, sortOrder: oi, isActive: true },
              });
            } else {
              await tx.modifier.create({ data: { modifierGroupId: grp.id, name: o.name, priceAdjustment: o.price, sortOrder: oi } });
            }
          }
          // Options taken out stop showing; past orders keep their names.
          const dropped = grp.modifiers.filter((m) => m.isActive && !seen.has(m.id)).map((m) => m.id);
          if (dropped.length) await tx.modifier.updateMany({ where: { id: { in: dropped } }, data: { isActive: false } });
          groupId = grp.id;
        } else {
          const grp = await tx.modifierGroup.create({
            data: {
              name: g.name,
              minSelect: min,
              maxSelect: max,
              isRequired: min > 0,
              freeChoices: link ? link.modifierGroup.freeChoices : 0,
              sortOrder: gi,
              modifiers: { create: g.options.map((o, oi) => ({ name: o.name, priceAdjustment: o.price, sortOrder: oi })) },
            },
          });
          groupId = grp.id;
        }
        keep.push(groupId);
        await tx.menuItemModifierGroup.upsert({
          where: { menuItemId_modifierGroupId: { menuItemId: itemId, modifierGroupId: groupId } },
          update: { sortOrder: gi },
          create: { menuItemId: itemId, modifierGroupId: groupId, sortOrder: gi },
        });
      }
      await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: itemId, modifierGroupId: { notIn: keep } } });

      return { ok: true, id: itemId };
    }, { timeout: 20_000 }),
  );
}
