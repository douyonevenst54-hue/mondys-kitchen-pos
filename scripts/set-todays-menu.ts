/**
 * Make today's menu exactly the "Today's Special" sheet (Oct 11, 2026).
 *
 *   Preview (changes nothing):  npx tsx scripts/set-todays-menu.ts
 *   Save:                       npx tsx scripts/set-todays-menu.ts --apply
 *
 * Every other dish moves to the dish library (hidden, not deleted). Dishes
 * that already exist are re-used by name; new ones are created with no
 * price, so type the prices on the Today's menu screen (they stay hidden
 * from customers until they have one). Safe to run again.
 *
 * After this, staff manage the menu from the POS: staff menu → Today's menu.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Choice = { name: string; pick: number; required: boolean; options: string[] };
type Dish = { name: string; description?: string; choices?: Choice[] };

const TODAY: { section: string; dishes: Dish[] }[] = [
  {
    section: "Breakfast",
    dishes: [
      { name: "Egg & Cheese Sandwich" },
      { name: "Sausage, Egg & Cheese Sandwich" },
      { name: "Ham & Cheese Sandwich" },
      { name: "Bacon, Egg & Cheese Sandwich" },
      { name: "Scrambled Eggs with Home Fries" },
    ],
  },
  {
    section: "Lunch Special",
    dishes: [
      {
        name: "Rice & Pigeon Peas",
        description: "Lunch special with your choice of side and protein",
        choices: [
          { name: "Side", pick: 1, required: true, options: ["Pasta Salad", "Beet Salad"] },
          { name: "Protein", pick: 1, required: true, options: ["Chicken", "Griot (Fried Pork)"] },
        ],
      },
    ],
  },
];

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, price: true, showOnRegister: true, showOnline: true, _count: { select: { modifierGroups: true } } },
  });
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const cats = await prisma.category.findMany({ select: { id: true, name: true, sortOrder: true, isActive: true } });

  const wanted = TODAY.flatMap((s) => s.dishes.map((d) => ({ ...d, section: s.section })));
  const reuse = wanted.filter((d) => byName.has(d.name.toLowerCase()));
  const create = wanted.filter((d) => !byName.has(d.name.toLowerCase()));
  const keepIds = new Set(reuse.map((d) => byName.get(d.name.toLowerCase())!.id));
  const toHide = items.filter((i) => !keepIds.has(i.id) && (i.showOnRegister || i.showOnline));

  console.log(apply ? "\nSAVING today's menu:\n" : "\nPREVIEW (nothing saved yet):\n");
  for (const s of TODAY) {
    console.log(`  ${s.section}${cats.some((c) => c.name.toLowerCase() === s.section.toLowerCase()) ? "" : "  (new section)"}`);
    for (const d of s.dishes) {
      const found = byName.get(d.name.toLowerCase());
      const price = found && Number(found.price) > 0 ? `$${Number(found.price).toFixed(2)}` : "needs a price";
      console.log(`    • ${d.name}  [${found ? "already saved" : "new"}, ${price}]`);
    }
  }
  console.log(`\n  ${toHide.length} other dishes move to the dish library (hidden, not deleted).`);

  if (!apply) {
    console.log("\nLooks right? Run again with --apply to save.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // Sections, in the order of the sheet, at the top of the menu.
      const sectionId = new Map<string, string>();
      const todayNames = new Set(TODAY.map((s) => s.section.toLowerCase()));
      const top = Math.min(1, ...cats.filter((c) => !todayNames.has(c.name.toLowerCase())).map((c) => c.sortOrder));
      for (const [si, s] of TODAY.entries()) {
        const existing = cats.find((c) => c.name.toLowerCase() === s.section.toLowerCase());
        const order = top - TODAY.length + si;
        const cat = existing
          ? await tx.category.update({ where: { id: existing.id }, data: { isActive: true, sortOrder: order } })
          : await tx.category.create({ data: { name: s.section, sortOrder: order } });
        sectionId.set(s.section, cat.id);
      }

      // Everything else to the library.
      await tx.menuItem.updateMany({ where: { isActive: true }, data: { showOnRegister: false, showOnline: false } });

      for (const d of wanted) {
        const found = byName.get(d.name.toLowerCase());
        const item = found
          ? await tx.menuItem.update({
              where: { id: found.id },
              data: { showOnRegister: true, showOnline: true, serveDays: 127 },
            })
          : await tx.menuItem.create({
              data: {
                name: d.name,
                description: d.description ?? null,
                price: 0,
                categoryId: sectionId.get(d.section)!,
                sortOrder: TODAY.find((s) => s.section === d.section)!.dishes.findIndex((x) => x.name === d.name),
                isAvailable: true,
                showOnRegister: true,
                showOnline: true,
                serveDays: 127,
              },
            });

        // Choices only for new dishes (or saved ones that have none yet).
        if (d.choices && (!found || found._count.modifierGroups === 0)) {
          for (const [gi, c] of d.choices.entries()) {
            const grp = await tx.modifierGroup.create({
              data: {
                name: c.name,
                minSelect: c.required ? c.pick : 0,
                maxSelect: c.pick,
                isRequired: c.required,
                sortOrder: gi,
                modifiers: { create: c.options.map((name, oi) => ({ name, sortOrder: oi })) },
              },
            });
            await tx.menuItemModifierGroup.create({ data: { menuItemId: item.id, modifierGroupId: grp.id, sortOrder: gi } });
          }
        }
      }
    },
    { timeout: 60_000 },
  );

  const unpriced = await prisma.menuItem.count({ where: { isActive: true, showOnRegister: true, price: { lte: 0 } } });
  console.log(`\n✓ Today's menu saved.`);
  if (unpriced) console.log(`  ${unpriced} dishes need a price: POS staff menu → Today's menu, type the price next to each dish.`);
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}\nNothing was changed.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
