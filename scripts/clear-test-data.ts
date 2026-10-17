/**
 * Before going live: delete every order and everything made while testing,
 * so reports, rewards and order numbers start clean.
 *
 *   Preview (changes nothing):  npx tsx scripts/clear-test-data.ts
 *   Delete:                     npx tsx scripts/clear-test-data.ts --apply
 *
 * DELETES: all orders (items, payments, discounts used), shifts, rewards
 * customers and their points, email campaigns, contact/catering/feedback
 * messages, and login lockouts. Order numbers restart at #1.
 *
 * KEEPS: the menu, dish photos, choices, prices, barcodes, promo codes,
 * staff and PINs, PS Club posts, and every setting.
 *
 * Run it ONCE, before the first real customer. It can't be undone (Neon's
 * restore can bring the database back to a moment before, if needed).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "(unknown)";
    }
  })();
  const counts = {
    orders: await prisma.order.count(),
    payments: await prisma.payment.count(),
    shifts: await prisma.shift.count(),
    "rewards customers": await prisma.customer.count(),
    "points history": await prisma.loyaltyEvent.count(),
    campaigns: await prisma.campaign.count(),
    messages: await prisma.customerMessage.count(),
    "portion log (sales)": await prisma.portionEvent.count({ where: { orderId: { not: null } } }),
  };
  const first = await prisma.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const last = await prisma.order.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });

  console.log(`\nDatabase: ${host}`);
  console.log(apply ? "\nDELETING test data:\n" : "\nPREVIEW (nothing deleted yet):\n");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${v}`);
  if (first && last) console.log(`\n  Orders from ${first.createdAt.toLocaleString()} to ${last.createdAt.toLocaleString()}`);
  console.log("\n  Kept: menu, photos, prices, barcodes, promo codes, staff, PS Club posts, settings.");

  if (!apply) {
    console.log("\nOnly run this before going live. If this is right, run again with --apply.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.loyaltyEvent.deleteMany({});
      await tx.portionEvent.deleteMany({ where: { orderId: { not: null } } });
      await tx.orderDiscount.deleteMany({});
      await tx.order.deleteMany({}); // items, choices and payments go with them
      await tx.shift.deleteMany({});
      await tx.campaign.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.customerMessage.deleteMany({});
      await tx.loginThrottle.deleteMany({});
      await tx.$executeRawUnsafe(`ALTER SEQUENCE "Order_orderNumber_seq" RESTART WITH 1`);
    },
    { timeout: 120_000 },
  );
  console.log("\n✓ Test data cleared. The next order will be #1.");
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}\nNothing was changed.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
