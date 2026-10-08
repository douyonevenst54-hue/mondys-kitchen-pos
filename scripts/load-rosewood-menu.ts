/**
 * Load the Rosewood Cafe menu.
 *
 *   Preview (changes nothing):  npx tsx scripts/load-rosewood-menu.ts
 *   Save to the database:       npx tsx scripts/load-rosewood-menu.ts --apply
 *
 * Safe to run again after editing scripts/rosewood-menu-data.ts:
 *  - adds new dishes and choices, updates names/descriptions/numbers
 *  - never touches prices you set in the POS
 *  - never re-hides or re-shows dishes a manager changed in Daily menu
 *
 * The FIRST run also hides every old dish on the register and online menu.
 * Nothing is deleted: turn any old dish back on from Daily menu, and past
 * orders keep their history. Add --hide-old to hide old dishes again later.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GROUPS, MENU, RECEIPT_FOOTER, RESTAURANT_NAME } from "./rosewood-menu-data";

const apply = process.argv.includes("--apply");
const forceHideOld = process.argv.includes("--hide-old");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function check() {
  const keys = new Set(GROUPS.map((g) => g.key));
  if (keys.size !== GROUPS.length) throw new Error("Two option groups share a key");
  for (const g of GROUPS) {
    if (g.min < 0 || g.max < 1 || g.min > g.max || g.max > g.options.length) {
      throw new Error(`Group ${g.key}: min/max don't fit its ${g.options.length} options`);
    }
  }
  for (const c of MENU) {
    for (const i of c.items) {
      for (const k of i.groups ?? []) if (!keys.has(k)) throw new Error(`${i.name} uses unknown group ${k}`);
    }
  }
}

async function main() {
  check();

  const firstRun = (await prisma.modifierGroup.count({ where: { key: { startsWith: "rw-" } } })) === 0;
  const hideOld = firstRun || forceHideOld;

  // ── Work out what will change ─────────────────────────────────────────────
  const existingCats = await prisma.category.findMany({ select: { id: true, name: true } });
  const catByName = new Map(existingCats.map((c) => [c.name, c]));
  const newCatNames = MENU.filter((c) => !catByName.has(c.name)).map((c) => c.name);

  const allItems = await prisma.menuItem.findMany({
    select: { id: true, name: true, categoryId: true, isActive: true, showOnRegister: true, showOnline: true },
  });
  const itemKey = (catId: string, name: string) => `${catId}::${name.toLowerCase()}`;
  const itemByKey = new Map(allItems.map((i) => [itemKey(i.categoryId, i.name), i]));

  let createCount = 0;
  let updateCount = 0;
  const rosewoodIds = new Set<string>();
  for (const c of MENU) {
    const cat = catByName.get(c.name);
    for (const i of c.items) {
      const found = cat ? itemByKey.get(itemKey(cat.id, i.name)) : undefined;
      if (found) {
        updateCount++;
        rosewoodIds.add(found.id);
      } else createCount++;
    }
  }
  const toHide = hideOld
    ? allItems.filter((i) => i.isActive && !rosewoodIds.has(i.id) && (i.showOnRegister || i.showOnline))
    : [];

  console.log(apply ? "\nSAVING the Rosewood menu:\n" : "\nPREVIEW (nothing saved yet):\n");
  console.log(`  Categories: ${MENU.length} (${newCatNames.length} new${newCatNames.length ? ": " + newCatNames.join(", ") : ""})`);
  console.log(`  Dishes:     ${createCount} to add, ${updateCount} already there (kept with their prices)`);
  console.log(`  Choices:    ${GROUPS.length} option groups, ${GROUPS.reduce((n, g) => n + g.options.length, 0)} options (all free; set upcharges in Prices)`);
  console.log(`  Old menu:   ${hideOld ? `${toHide.length} old dishes will be hidden (not deleted)` : "left as is"}`);
  console.log(`  Name:       restaurant name becomes "${RESTAURANT_NAME}"`);

  if (!apply) {
    console.log("\nLooks right? Run again with --apply to save.");
    return;
  }

  // ── Option groups and options ─────────────────────────────────────────────
  const groupId = new Map<string, string>();
  for (const [gi, g] of GROUPS.entries()) {
    const group = await prisma.modifierGroup.upsert({
      where: { key: g.key },
      update: { name: g.name, minSelect: g.min, maxSelect: g.max, isRequired: g.min > 0, isActive: true },
      create: { key: g.key, name: g.name, minSelect: g.min, maxSelect: g.max, isRequired: g.min > 0, sortOrder: gi },
    });
    groupId.set(g.key, group.id);
    const existing = await prisma.modifier.findMany({ where: { modifierGroupId: group.id }, select: { id: true, name: true } });
    for (const [oi, name] of g.options.entries()) {
      const found = existing.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (found) {
        await prisma.modifier.update({ where: { id: found.id }, data: { name, sortOrder: oi, isActive: true } });
      } else {
        await prisma.modifier.create({ data: { modifierGroupId: group.id, name, sortOrder: oi, priceAdjustment: 0 } });
      }
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────
  if (firstRun) {
    // Old categories go after the new ones (they only show if a dish in them is turned back on).
    for (const c of existingCats) {
      if (!MENU.some((m) => m.name === c.name)) {
        await prisma.category.update({ where: { id: c.id }, data: { sortOrder: { increment: 100 } } });
      }
    }
  }
  for (const [ci, c] of MENU.entries()) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { sortOrder: ci + 1, isActive: true },
      create: { name: c.name, sortOrder: ci + 1 },
    });
    catByName.set(c.name, { id: cat.id, name: cat.name });

    // ── Dishes ──────────────────────────────────────────────────────────────
    for (const [ii, i] of c.items.entries()) {
      const found = itemByKey.get(itemKey(cat.id, i.name));
      const details = {
        name: i.name,
        description: i.description ?? null,
        menuNumber: i.number ?? null,
        isSignature: i.signature ?? false,
        sortOrder: ii,
        isActive: true,
      };
      const item = found
        ? await prisma.menuItem.update({
            where: { id: found.id },
            data: hideOld ? { ...details, showOnRegister: true, showOnline: true } : details,
          })
        : await prisma.menuItem.create({
            // Price 0 = "needs a price": stays off the register and online until set in Prices.
            data: { ...details, categoryId: cat.id, price: 0, isAvailable: true, showOnRegister: true, showOnline: true },
          });

      // Link this dish's choices, in order; drop links no longer listed.
      const wanted = (i.groups ?? []).map((k) => groupId.get(k)!);
      await prisma.menuItemModifierGroup.deleteMany({
        where: { menuItemId: item.id, modifierGroupId: { notIn: wanted } },
      });
      for (const [gi, gid] of wanted.entries()) {
        await prisma.menuItemModifierGroup.upsert({
          where: { menuItemId_modifierGroupId: { menuItemId: item.id, modifierGroupId: gid } },
          update: { sortOrder: gi },
          create: { menuItemId: item.id, modifierGroupId: gid, sortOrder: gi },
        });
      }
    }
  }

  // ── Hide the old menu (first run only, unless --hide-old) ─────────────────
  if (toHide.length) {
    await prisma.menuItem.updateMany({
      where: { id: { in: toHide.map((i) => i.id) } },
      data: { showOnRegister: false, showOnline: false },
    });
  }

  // ── Restaurant name and receipt footer ────────────────────────────────────
  const settings = await prisma.restaurantSettings.findFirst();
  if (settings) {
    const oldFooter = !settings.receiptFooter || /mondy'?s kitchen/i.test(settings.receiptFooter);
    await prisma.restaurantSettings.update({
      where: { id: settings.id },
      data: { name: RESTAURANT_NAME, ...(oldFooter ? { receiptFooter: RECEIPT_FOOTER } : {}) },
    });
  } else {
    await prisma.restaurantSettings.create({ data: { name: RESTAURANT_NAME, receiptFooter: RECEIPT_FOOTER } });
  }

  const unpriced = await prisma.menuItem.count({ where: { isActive: true, showOnRegister: true, price: { lte: 0 } } });
  console.log(`\n✓ Rosewood menu saved. ${toHide.length} old dishes hidden.`);
  console.log(`  ${unpriced} dishes still need a price: POS staff menu → Prices.`);
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}\nNothing more was changed.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
