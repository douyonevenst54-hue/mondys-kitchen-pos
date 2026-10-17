/**
 * Set a business's name, brand and basics from a small JSON file.
 * Used once per install (new client, or Mondy's after the white-label update).
 *
 *   Preview (changes nothing):  npx tsx scripts/setup-business.ts brands/rosewood.json
 *   Save:                       npx tsx scripts/setup-business.ts brands/rosewood.json --apply
 *
 * Only the fields present in the file are changed. See brands/example.json
 * for every field. Everything here can also be edited later in
 * Online settings (Brand, hours, details) and Tax & accounting.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Hours = Record<string, string | null>;
type Business = {
  name?: string;
  brandName?: string;
  brandTagline?: string;
  brandColor?: string;
  clubName?: string;
  rewardsName?: string;
  phone?: string;
  address?: string;
  email?: string;
  timezone?: string;
  taxRatePercent?: number;
  businessHours?: Hours;
  rewards?: { enabled?: boolean; pointsPerDollar?: number; rewardPoints?: number; rewardValue?: number };
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\nNothing was changed.`);
  process.exit(1);
}

function contrastWithWhite(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] + 0.05);
}

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!file) fail("Give the business file, e.g. brands/rosewood.json");

let b: Business;
try {
  b = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  fail(`Couldn't read ${file}: ${e instanceof Error ? e.message : e}`);
}

const data: Prisma.RestaurantSettingsUpdateInput = {};
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
if (b.name !== undefined) data.name = str(b.name, 80) ?? fail("name can't be empty");
if (b.brandName !== undefined) data.brandName = str(b.brandName, 40) ?? null;
if (b.brandTagline !== undefined) data.brandTagline = str(b.brandTagline, 40) ?? null;
if (b.brandColor !== undefined) {
  if (!/^#[0-9a-fA-F]{6}$/.test(b.brandColor)) fail("brandColor must look like #8b5e3c");
  if (contrastWithWhite(b.brandColor) < 4.5) fail("brandColor is too light for white button text; pick a darker shade");
  data.brandColor = b.brandColor.toLowerCase();
}
if (b.clubName !== undefined) data.clubName = str(b.clubName, 30) ?? null;
if (b.rewardsName !== undefined) data.rewardsName = str(b.rewardsName, 40) ?? null;
if (b.phone !== undefined) data.phone = str(b.phone, 30) ?? null;
if (b.address !== undefined) data.address = str(b.address, 160) ?? null;
if (b.email !== undefined) data.email = str(b.email, 120) ?? null;
if (b.timezone !== undefined) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: b.timezone });
  } catch {
    fail(`Unknown timezone ${b.timezone}`);
  }
  data.timezone = b.timezone;
}
if (b.taxRatePercent !== undefined) {
  if (!(b.taxRatePercent >= 0 && b.taxRatePercent <= 20)) fail("taxRatePercent must be between 0 and 20");
  data.taxRate = Math.round(b.taxRatePercent * 100) / 10000;
}
if (b.businessHours !== undefined) {
  for (const d of DAYS) {
    const v = b.businessHours[d];
    if (v !== null && !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) {
      fail(`businessHours.${d} must be "HH:MM-HH:MM" or null (closed)`);
    }
  }
  data.businessHours = Object.fromEntries(DAYS.map((d) => [d, b.businessHours![d] ?? null]));
}
if (b.rewards) {
  const r = b.rewards;
  if (r.enabled !== undefined) data.loyaltyEnabled = Boolean(r.enabled);
  if (r.pointsPerDollar !== undefined) data.loyaltyPointsPerDollar = Math.max(1, Math.round(r.pointsPerDollar));
  if (r.rewardPoints !== undefined) data.loyaltyRewardPoints = Math.max(10, Math.round(r.rewardPoints));
  if (r.rewardValue !== undefined) data.loyaltyRewardValue = Math.max(1, r.rewardValue);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const current = await prisma.restaurantSettings.findFirst();
  console.log(apply ? "\nSAVING business settings:\n" : "\nPREVIEW (nothing saved yet):\n");
  for (const [k, v] of Object.entries(data)) {
    const before = current ? (current as Record<string, unknown>)[k] : undefined;
    const show = (x: unknown) => (x && typeof x === "object" ? JSON.stringify(x) : String(x ?? "—"));
    console.log(`  ${k.padEnd(24)} ${show(before)}  →  ${show(v)}`);
  }
  if (!apply) {
    console.log("\nLooks right? Run again with --apply to save.");
    return;
  }
  if (current) await prisma.restaurantSettings.update({ where: { id: current.id }, data });
  else await prisma.restaurantSettings.create({ data: data as Prisma.RestaurantSettingsCreateInput });
  console.log("\n✓ Saved. Reload the POS and order page to see it.");
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}\nNothing was changed.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
