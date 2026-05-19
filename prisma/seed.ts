/**
 * Mondy's Kitchen POS — Seed Script
 *
 * Run with: npx prisma db seed
 * (or directly: npx tsx prisma/seed.ts)
 *
 * Safe to re-run: uses upsert by unique fields so it won't create duplicates.
 *
 * SECURITY NOTE — Placeholder PINs are hardcoded here for development only:
 *   OWNER (Jhon):     1234
 *   MANAGER (Test):   5678
 *   CASHIER (Test):   9999
 * Change these via the admin UI before going live. The seed only sets them
 * on initial creation; re-running won't reset them.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Restaurant settings
// ─────────────────────────────────────────────────────────────────────────────

async function seedSettings() {
  const existing = await prisma.restaurantSettings.findFirst();
  if (existing) {
    console.log("✓ Restaurant settings already exist, skipping.");
    return;
  }
  await prisma.restaurantSettings.create({
    data: {
      name: "Mondy's Kitchen",
      taxRate: 0.0625, // Massachusetts meals tax
      currency: "USD",
      timezone: "America/New_York",
      receiptFooter: "Thank you for dining with Mondy's Kitchen!",
    },
  });
  console.log("✓ Restaurant settings created.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Staff
// ─────────────────────────────────────────────────────────────────────────────

async function seedStaff() {
  const staffData = [
    {
      email: "douyonevenst54@gmail.com",
      name: "Jhon Douyon",
      role: "OWNER" as const,
      pin: "1234",
    },
    {
      email: "manager@mondys.test",
      name: "Manager Test",
      role: "MANAGER" as const,
      pin: "5678",
    },
    {
      email: "cashier@mondys.test",
      name: "Cashier Test",
      role: "CASHIER" as const,
      pin: "9999",
    },
  ];

  for (const s of staffData) {
    const pinHash = await hashPin(s.pin);
    await prisma.staff.upsert({
      where: { email: s.email },
      update: {}, // don't overwrite PINs on re-run
      create: {
        email: s.email,
        name: s.name,
        role: s.role,
        pinHash,
      },
    });
  }
  console.log(`✓ Seeded ${staffData.length} staff accounts.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Modifier groups (Spice level, optional)
// ─────────────────────────────────────────────────────────────────────────────

async function seedModifiers() {
  // We use the group name as a de-facto unique key for upsert via findFirst.
  const existing = await prisma.modifierGroup.findFirst({
    where: { name: "Spice Level" },
  });
  if (existing) {
    console.log("✓ Modifier groups already seeded, skipping.");
    return existing.id;
  }

  const spiceGroup = await prisma.modifierGroup.create({
    data: {
      name: "Spice Level",
      isRequired: false, // optional — cashier can skip if customer doesn't specify
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 0,
      modifiers: {
        create: [
          { name: "Mild", priceAdjustment: 0, sortOrder: 0 },
          { name: "Medium", priceAdjustment: 0, sortOrder: 1 },
          { name: "Hot", priceAdjustment: 0, sortOrder: 2 },
        ],
      },
    },
  });
  console.log("✓ Spice Level modifier group created with 3 options.");
  return spiceGroup.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Categories
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_DEFINITIONS = [
  { name: "Breakfast", sortOrder: 1 },
  { name: "Dinner Plate", sortOrder: 2 },
  { name: "Seafood", sortOrder: 3 },
  { name: "Specials", sortOrder: 4 },
  { name: "Stew / Bouyon", sortOrder: 5 },
  { name: "Sandwiches", sortOrder: 6 },
  { name: "Salads and Pastas", sortOrder: 7 },
  { name: "Sides", sortOrder: 8 },
  { name: "Smoothie", sortOrder: 9 },
  { name: "Drinks", sortOrder: 10 },
  { name: "Dessert", sortOrder: 11 },
];

async function seedCategories() {
  const map: Record<string, string> = {};
  for (const def of CATEGORY_DEFINITIONS) {
    const cat = await prisma.category.upsert({
      where: { name: def.name },
      update: { sortOrder: def.sortOrder },
      create: { name: def.name, sortOrder: def.sortOrder },
    });
    map[def.name] = cat.id;
  }
  console.log(`✓ Seeded ${CATEGORY_DEFINITIONS.length} categories.`);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Menu items
// ─────────────────────────────────────────────────────────────────────────────

type MenuItemSeed = {
  name: string;
  price: number;
  category: string;
  isAvailable?: boolean;
  spiceApplies?: boolean; // attach Spice Level modifier group
  description?: string;
};

const MENU: MenuItemSeed[] = [
  // ─── BREAKFAST ─────────────────────────────────────────────────────────────
  { name: "Perfect morning - AK100 dujour", price: 10.0, category: "Breakfast", isAvailable: true },
  { name: "Fried eggs with Green Banana", price: 15.0, category: "Breakfast" },
  { name: "Fried eggs with herring and Plantain", price: 15.0, category: "Breakfast" },
  { name: "Haitian Deluxe breakfast - Morue/salted cod", price: 15.0, category: "Breakfast" },
  { name: "Spaghetti creole", price: 15.0, category: "Breakfast" },
  { name: "Chef special - cornmeal with spinach", price: 10.0, category: "Breakfast" },
  { name: "Fried eggs Sandwich", price: 10.0, category: "Breakfast" },
  { name: "Omelette aux Épinard with boiled plantain", price: 15.0, category: "Breakfast" },
  { name: "Omelette aux epinard with toast", price: 12.0, category: "Breakfast" },
  { name: "Boiled eggs (2)", price: 5.0, category: "Breakfast" },
  { name: "Coffee", price: 2.5, category: "Breakfast", isAvailable: true },
  { name: "Hot Chocolate", price: 5.0, category: "Breakfast", isAvailable: false },
  { name: "TEA", price: 2.5, category: "Breakfast", isAvailable: false },

  // ─── DINNER PLATE ──────────────────────────────────────────────────────────
  { name: "Fried chicken with fritter", price: 19.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fried chicken with Rice and beans sauce", price: 19.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fried chicken with Rice and beans", price: 19.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fowl Chicken with fritter", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fowl Chicken sauce with rice and beans", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fowl Chicken sauce with rice and beans sauce", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fowl Chicken sauce with boiled plantain and yam", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fried turkey with fritter", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fried turkey with white rice and beans sauce", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Fried turkey with rice and beans", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Turkey Sauce with rice and beans", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Turkey Sauce with white rice and beans sauce", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso Kabrit (Goat fried) with fritter", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Goat stew with rice and bean", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso Kabrit (Goat fried) with rice and bean", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso Kabrit (Goat fried) with white rice and bean sauce", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Goat stew with white rice and bean sauce", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Goat stew with boiled plantain and yam", price: 23.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Griot, fried pork with fritter", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Griot, fried pork with Rice and beans", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Griot, fried pork with white rice and beans sauce", price: 20.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso, fried beef with fritter", price: 22.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso beef with white rice and beans sauce", price: 22.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Tasso beef with rice and beans", price: 22.0, category: "Dinner Plate", spiceApplies: true },
  { name: "Chicken wing and French fries", price: 16.99, category: "Dinner Plate", spiceApplies: true },

  // ─── SEAFOOD ───────────────────────────────────────────────────────────────
  { name: "Fried Fish with fritter", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fish stew with fritter", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fried fish with rice and beans", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fish stew with rice and bean", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fried Fish with white rice and beans sauce", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fish stew with white rice and bean sauce", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fried Fish with boiled plantain and yam", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Fish stew with boiled plantain and yam", price: 32.0, category: "Seafood", spiceApplies: true },
  { name: "Filet poisson et frittes", price: 25.0, category: "Seafood" },
  { name: "Lambi, Conch with fritter", price: 37.0, category: "Seafood", spiceApplies: true },
  { name: "Lambi, Conch with rice and beans", price: 37.0, category: "Seafood", spiceApplies: true },
  { name: "Shrimp sauce with rice and beans sauce", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Shrimp sauce with rice and beans", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Shrimp sauce with boiled plantain and yanm", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Fried shrimp and fritter", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Haitian Legim with seafood and rice, beans sauce", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Haitian lalo with white rice and beans sauce", price: 24.0, category: "Seafood", spiceApplies: true },
  { name: "Haitian Legim with seafood, rice and beans", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Sauce Kalalou with rice and beans sauce", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Sauce kalalou with rice and beans", price: 25.0, category: "Seafood", spiceApplies: true },
  { name: "Fish fried", price: 42.0, category: "Seafood", spiceApplies: true },

  // ─── SPECIALS ──────────────────────────────────────────────────────────────
  { name: "Lalo with beef, white rice and bean sauce", price: 22.0, category: "Specials", spiceApplies: true },
  { name: "Lalo with Pork, white rice and bean sauce", price: 22.0, category: "Specials", spiceApplies: true },
  { name: "Tonmtonm, Fufu", price: 22.0, category: "Specials" },
  { name: "Legume with beef, White rice and beans sauce", price: 22.0, category: "Specials", spiceApplies: true },
  { name: "Legume with beef and rice and bean", price: 22.0, category: "Specials", spiceApplies: true },
  { name: "Legume with pork, white rice and bean sauce", price: 20.0, category: "Specials", spiceApplies: true },
  { name: "Legume with pork and rice and bean", price: 20.0, category: "Specials", spiceApplies: true },
  { name: "Barbecue ribs", price: 20.0, category: "Specials", spiceApplies: true, isAvailable: false },
  { name: "Boulette / Haitian Meatballs", price: 18.0, category: "Specials", spiceApplies: true },
  { name: "Fowl chicken, pwa kongo sauce & white rice", price: 20.0, category: "Specials", spiceApplies: true, isAvailable: false },
  { name: "Pitimi, sos pwa kongo, poul di", price: 22.0, category: "Specials", spiceApplies: true, isAvailable: false },
  { name: "Haitian Mother's day special plate 1", price: 40.0, category: "Specials", isAvailable: false },
  { name: "Haitian Mother's day special plate 2", price: 40.0, category: "Specials", isAvailable: false },
  { name: "Haitian Mother's day special plate #3", price: 40.0, category: "Specials" },
  { name: "Squash soup / Soup joromou", price: 15.0, category: "Specials", isAvailable: true },
  { name: "Grill Goat with rice and beans sauce", price: 30.0, category: "Specials", spiceApplies: true },
  { name: "Grill Fish / Rice and bean sauce", price: 40.0, category: "Specials", spiceApplies: true },
  { name: "Grill goat / Kabrit Boukannen", price: 30.0, category: "Specials", spiceApplies: true },
  { name: "Mayi sos pwa legim", price: 20.0, category: "Specials" },
  { name: "Grilled conch / Lambi boukanne", price: 40.0, category: "Specials", spiceApplies: true },
  { name: "Ragou pye bef (beef ragu)", price: 25.0, category: "Specials", spiceApplies: true, isAvailable: true },

  // ─── STEW / BOUYON ─────────────────────────────────────────────────────────
  { name: "Goat stew / konsonmen Kabrit", price: 22.0, category: "Stew / Bouyon", spiceApplies: true },
  { name: "Beef stew / Bouyon", price: 20.0, category: "Stew / Bouyon", spiceApplies: true },

  // ─── SANDWICHES ────────────────────────────────────────────────────────────
  { name: "Chicken salad sandwich", price: 8.0, category: "Sandwiches" },
  { name: "Plantain Hamburger", price: 8.99, category: "Sandwiches" },

  // ─── SALADS AND PASTAS ─────────────────────────────────────────────────────
  { name: "Creole Styles Spaghetti", price: 15.0, category: "Salads and Pastas" },
  { name: "Russian Salads", price: 5.0, category: "Salads and Pastas" },
  { name: "Garden Salads", price: 4.0, category: "Salads and Pastas" },
  { name: "Macaroni Gratine", price: 9.0, category: "Salads and Pastas" },
  { name: "Pasta Salads", price: 9.0, category: "Salads and Pastas" },
  { name: "Ceasar Salad", price: 13.0, category: "Salads and Pastas" },

  // ─── SIDES ─────────────────────────────────────────────────────────────────
  { name: "Fried Plantains", price: 5.0, category: "Sides" },
  { name: "Haitian Patés with Herring & Eggs", price: 10.0, category: "Sides" },
  { name: "White Rice", price: 5.0, category: "Sides" },
  { name: "Rice and Beans", price: 7.0, category: "Sides" },
  { name: "Boiled Plantains", price: 6.0, category: "Sides" },
  { name: "Akra", price: 7.0, category: "Sides" },
  { name: "Haitian patties with chicken", price: 9.0, category: "Sides" },
  { name: "Haitian patties with: eggs, herring, Hotdogs", price: 10.0, category: "Sides" },
  { name: "Haitian patties with beef", price: 9.0, category: "Sides" },

  // ─── SMOOTHIE ──────────────────────────────────────────────────────────────
  { name: "Heavenly mango smoothie", price: 7.99, category: "Smoothie", isAvailable: false },
  { name: "Haitian Mama's special - Corosol", price: 8.99, category: "Smoothie" },
  { name: "Haitian Mama's special - Papaye", price: 8.99, category: "Smoothie", isAvailable: false },
  { name: "Heavenly Berry", price: 7.99, category: "Smoothie", isAvailable: false },
  { name: "Heavenly Yuka ji lakay - Ji manyok", price: 9.99, category: "Smoothie", isAvailable: false },
  { name: "Build your own heavenly smoothie", price: 7.99, category: "Smoothie", isAvailable: false },

  // ─── DRINKS ────────────────────────────────────────────────────────────────
  { name: "Regular coke", price: 1.5, category: "Drinks" },
  { name: "Diet coke", price: 1.5, category: "Drinks" },
  { name: "Regular ginger ale", price: 1.5, category: "Drinks" },
  { name: "Diet Ginger ale", price: 1.5, category: "Drinks" },
  { name: "Regular sprite", price: 1.5, category: "Drinks" },
  { name: "Water 16.oz", price: 1.5, category: "Drinks" },
  { name: "T-ME's lemonade refresher", price: 5.0, category: "Drinks" },
  { name: "Mistic Juice", price: 2.5, category: "Drinks" },
  { name: "Fanta orange", price: 1.5, category: "Drinks" },
  { name: "Cola Couronne", price: 3.5, category: "Drinks" },
  { name: "Tampico", price: 3.0, category: "Drinks" },

  // ─── DESSERT ───────────────────────────────────────────────────────────────
  { name: "Pain Patate (Sweet Potato Bread)", price: 7.0, category: "Dessert", isAvailable: true },
  { name: "Blan Manje (creamy fruit cocktail)", price: 7.0, category: "Dessert", isAvailable: true },
  { name: "Bonbon sirop Mini", price: 3.0, category: "Dessert", isAvailable: false },
  { name: "Bonbon sirop", price: 8.0, category: "Dessert", isAvailable: false },
  { name: "Kokiyol", price: 5.0, category: "Dessert", isAvailable: false },
];

async function seedMenuItems(
  categoryMap: Record<string, string>,
  spiceGroupId: string
) {
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < MENU.length; i++) {
    const item = MENU[i];
    const categoryId = categoryMap[item.category];
    if (!categoryId) {
      console.warn(`⚠ No category found for "${item.name}" (${item.category})`);
      continue;
    }

    // Check for existing item by (name + categoryId) to avoid duplicates on re-run
    const existing = await prisma.menuItem.findFirst({
      where: { name: item.name, categoryId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const menuItem = await prisma.menuItem.create({
      data: {
        name: item.name,
        price: item.price,
        categoryId,
        isAvailable: item.isAvailable ?? true,
        sortOrder: i,
        description: item.description ?? null,
      },
    });

    if (item.spiceApplies) {
      await prisma.menuItemModifierGroup.create({
        data: {
          menuItemId: menuItem.id,
          modifierGroupId: spiceGroupId,
        },
      });
    }
    created++;
  }

  console.log(`✓ Seeded ${created} menu items (${skipped} already existed, skipped).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tables (a starter set — adjust to match the actual dining room)
// ─────────────────────────────────────────────────────────────────────────────

async function seedTables() {
  const existing = await prisma.table.count();
  if (existing > 0) {
    console.log(`✓ ${existing} tables already exist, skipping.`);
    return;
  }
  const tables = [
    { number: 1, capacity: 2 },
    { number: 2, capacity: 2 },
    { number: 3, capacity: 4 },
    { number: 4, capacity: 4 },
    { number: 5, capacity: 4 },
    { number: 6, capacity: 6 },
    { number: 7, capacity: 6 },
    { number: 8, capacity: 8, label: "Large family table" },
  ];
  for (const t of tables) {
    await prisma.table.create({ data: t });
  }
  console.log(`✓ Seeded ${tables.length} tables.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 Seeding Mondy's Kitchen POS...\n");

  await seedSettings();
  await seedStaff();
  const spiceGroupId = await seedModifiers();
  const categoryMap = await seedCategories();
  await seedMenuItems(categoryMap, spiceGroupId);
  await seedTables();

  console.log("\n✅ Seed complete!\n");
  console.log("Login PINs (CHANGE THESE BEFORE GOING LIVE):");
  console.log("  OWNER   (Jhon):    1234");
  console.log("  MANAGER (Test):    5678");
  console.log("  CASHIER (Test):    9999\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });