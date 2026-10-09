/**
 * Load the Rosewood Cafe menu.
 *
 *   Preview (changes nothing):  npx tsx scripts/load-rosewood-menu.ts
 *   Save to the database:       npx tsx scripts/load-rosewood-menu.ts --apply
 *   Also reset every price to the file:  add --set-prices
 *
 * Safe to run again after editing scripts/rosewood-menu-data.ts:
 *  - adds new dishes and choices, updates names/descriptions/numbers
 *  - fills in prices only for dishes that have none yet, unless you add
 *    --set-prices (then every dish and choice price matches the file; the
 *    preview lists each change first)
 *  - never re-hides or re-shows dishes a manager changed in Daily menu
 *
 * The FIRST run also hides every old dish on the register and online menu.
 * Nothing is deleted: turn any old dish back on from Daily menu, and past
 * orders keep their history. Add --hide-old to hide old dishes again later.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GROUPS, MENU, RECEIPT_FOOTER, RESTAURANT_NAME, type OptionDef } from "./rosewood-menu-data";

const apply = process.argv.includes("--apply");
const setPrices = process.argv.includes("--set-prices");
const opt = (o: OptionDef) => (typeof o === "string" ? { name: o, price: 0 } : o);
const money = (n: number) => `$${n.toFixed(2)}`;
const forceHideOld = process.argv.includes("--hide-old");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function check() {
  const keys = new Set(GROUPS.map((g) => g.key));
  if (keys.size !== GROUPS.length) throw new Error("Two option groups share a key");
  for (const g of GROUPS) {
    if (g.min < 0 || g.max < 1 || g.min > g.max || g.max > g.options.length) {
      throw new Error(`Group ${g.key}: min/max don't fit its ${g.options.length} options`);
    }
    for (const o of g.options.map(opt)) {
      if (!(o.price >= 0 && o.price < 100)) throw new Error(`Group ${g.key}: bad price for ${o.name}`);
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

  // ── Price changes this run would make ─────────────────────────────────────
  const priceChanges: string[] = [];
  const currentPrice = new Map(
    (await prisma.menuItem.findMany({ select: { id: true, price: true } })).map((r) => [r.id, Number(r.price)]),
  );
  for (const c of MENU) {
    const cat = catByName.get(c.name);
    for (const i of c.items) {
      if (i.price == null) continue;
      const found = cat ? itemByKey.get(itemKey(cat.id, i.name)) : undefined;
      const now = found ? (currentPrice.get(found.id) ?? 0) : 0;
      if (Math.abs(now - i.price) < 0.005) continue;
      if (now > 0 && !setPrices) continue; // keep POS prices unless --set-prices
      priceChanges.push(`${i.name}: ${now > 0 ? money(now) : "no price"} → ${money(i.price)}`);
    }
  }
  const optionChanges: string[] = [];
  for (const g of GROUPS) {
    const group = await prisma.modifierGroup.findUnique({
      where: { key: g.key },
      include: { modifiers: { select: { name: true, priceAdjustment: true } } },
    });
    for (const o of g.options.map(opt)) {
      const m = group?.modifiers.find((x) => x.name.toLowerCase() === o.name.toLowerCase());
      const now = m ? Number(m.priceAdjustment) : null;
      if (now !== null && (Math.abs(now - o.price) < 0.005 || !setPrices)) continue;
      if (now === null && o.price === 0) continue;
      optionChanges.push(`${g.name} › ${o.name}: ${now === null ? "new" : now ? "+" + money(now) : "free"} → ${o.price ? "+" + money(o.price) : "free"}`);
    }
  }

  console.log(apply ? "\nSAVING the Rosewood menu:\n" : "\nPREVIEW (nothing saved yet):\n");
  console.log(`  Categories: ${MENU.length} (${newCatNames.length} new${newCatNames.length ? ": " + newCatNames.join(", ") : ""})`);
  console.log(`  Dishes:     ${createCount} to add, ${updateCount} already there`);
  console.log(`  Options:    ${GROUPS.length} option groups, ${GROUPS.reduce((n, g) => n + g.options.length, 0)} options`);
  console.log(`  Old menu:   ${hideOld ? `${toHide.length} old dishes will be hidden (not deleted)` : "left as is"}`);
  console.log(`  Name:       restaurant name becomes "${RESTAURANT_NAME}"`);
  console.log(`  Prices:     ${priceChanges.length} dish price${priceChanges.length === 1 ? "" : "s"} to set${setPrices ? "" : " (dishes with no price only; add --set-prices to match the file exactly)"}`);
  for (const line of priceChanges) console.log(`              ${line}`);
  console.log(`  Choices:    ${optionChanges.length} choice charge${optionChanges.length === 1 ? "" : "s"} to set`);
  for (const line of optionChanges) console.log(`              ${line}`);

  if (!apply) {
    console.log("\nLooks right? Run again with --apply to save.");
    return;
  }

  // ── Option groups and options ─────────────────────────────────────────────
  const groupId = new Map<string, string>();
  for (const [gi, g] of GROUPS.entries()) {
    const group = await prisma.modifierGroup.upsert({
      where: { key: g.key },
      update: { name: g.name, minSelect: g.min, maxSelect: g.max, freeChoices: g.free ?? 0, isRequired: g.min > 0, isActive: true },
      create: {
        key: g.key,
        name: g.name,
        minSelect: g.min,
        maxSelect: g.max,
        freeChoices: g.free ?? 0,
        isRequired: g.min > 0,
        sortOrder: gi,
      },
    });
    groupId.set(g.key, group.id);
    const existing = await prisma.modifier.findMany({ where: { modifierGroupId: group.id }, select: { id: true, name: true } });
    const listed = g.options.map(opt);
    for (const [oi, o] of listed.entries()) {
      const found = existing.find((m) => m.name.toLowerCase() === o.name.toLowerCase());
      if (found) {
        await prisma.modifier.update({
          where: { id: found.id },
          data: { name: o.name, sortOrder: oi, isActive: true, ...(setPrices ? { priceAdjustment: o.price } : {}) },
        });
      } else {
        await prisma.modifier.create({ data: { modifierGroupId: group.id, name: o.name, sortOrder: oi, priceAdjustment: o.price } });
      }
    }
    // Choices taken off the menu file (e.g. coconut milk for coffee) stop showing.
    const keep = new Set(listed.map((o) => o.name.toLowerCase()));
    const dropped = existing.filter((m) => !keep.has(m.name.toLowerCase())).map((m) => m.id);
    if (dropped.length) await prisma.modifier.updateMany({ where: { id: { in: dropped } }, data: { isActive: false } });
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
      const now = found ? (currentPrice.get(found.id) ?? 0) : 0;
      const priceUpdate = i.price != null && (setPrices || !(now > 0)) ? { price: i.price } : {};
      const item = found
        ? await prisma.menuItem.update({
            where: { id: found.id },
            data: { ...details, ...priceUpdate, ...(hideOld ? { showOnRegister: true, showOnline: true } : {}) },
          })
        : await prisma.menuItem.create({
            // No price in the file = "needs a price": stays off both menus until set in Prices.
            data: {
              ...details,
              categoryId: cat.id,
              price: i.price ?? 0,
              isAvailable: true,
              showOnRegister: true,
              showOnline: true,
            },
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
