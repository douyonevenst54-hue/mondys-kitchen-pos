/**
 * Load real staff PINs into the database.
 *
 *   Preview (changes nothing):  npx tsx scripts/set-staff-pins.ts
 *   Save to the database:       npx tsx scripts/set-staff-pins.ts --apply
 *
 * Reads staff-pins.json from the project root (that file is gitignored, so
 * PINs never reach GitHub). PINs are stored only as bcrypt hashes.
 *
 * Anyone active in the database but NOT in the file is deactivated, which
 * shuts off the seeded test accounts (PINs 5678 and 9999).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Entry = { name: string; email: string; role: "OWNER" | "MANAGER" | "CASHIER"; pin: string };

const apply = process.argv.includes("--apply");

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\nNothing was changed.`);
  process.exit(1);
}

let list: Entry[];
try {
  list = JSON.parse(readFileSync("staff-pins.json", "utf8"));
} catch (e) {
  fail(`Couldn't read staff-pins.json: ${(e as Error).message}`);
}

// ── Check the file before touching the database ─────────────────────────────
if (!Array.isArray(list) || list.length === 0) fail("staff-pins.json must be a list of people");
const emails = new Set<string>();
const pins = new Set<string>();
for (const [i, s] of list.entries()) {
  const where = `Entry ${i + 1} (${s?.name ?? "no name"})`;
  if (!s.name?.trim()) fail(`${where}: missing name`);
  if (!/^\S+@\S+\.\S+$/.test(s.email ?? "")) fail(`${where}: email is missing or invalid`);
  if (!["OWNER", "MANAGER", "CASHIER"].includes(s.role)) fail(`${where}: role must be OWNER, MANAGER or CASHIER`);
  if (!/^\d{6}$/.test(s.pin ?? "")) fail(`${where}: PIN must be exactly 6 digits, in quotes`);
  const email = s.email.trim().toLowerCase();
  if (emails.has(email)) fail(`${where}: email ${email} is used twice`);
  if (pins.has(s.pin)) fail(`${where}: PIN is used by two people`);
  emails.add(email);
  pins.add(s.pin);
}
if (!list.some((s) => s.role === "OWNER")) fail("At least one OWNER is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const existing = await prisma.staff.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  const byEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s]));
  const toDeactivate = existing.filter((s) => s.isActive && !emails.has(s.email.toLowerCase()));

  console.log(apply ? "\nSAVING to the database:\n" : "\nPREVIEW (nothing saved yet):\n");
  for (const s of list) {
    const found = byEmail.get(s.email.trim().toLowerCase());
    console.log(`  ${found ? "update" : "create"}  ${s.role.padEnd(7)}  ${s.name} <${s.email}>`);
  }
  for (const s of toDeactivate) {
    console.log(`  turn off ${s.role.padEnd(7)}  ${s.name} <${s.email}>`);
  }

  if (!apply) {
    console.log("\nLooks right? Run again with --apply to save.");
    return;
  }

  const rows = await Promise.all(
    list.map(async (s) => ({ ...s, email: s.email.trim().toLowerCase(), pinHash: await bcrypt.hash(s.pin, 10) })),
  );

  await prisma.$transaction([
    ...rows.map((s) =>
      prisma.staff.upsert({
        where: { email: byEmail.get(s.email)?.email ?? s.email },
        update: { name: s.name.trim(), role: s.role, pinHash: s.pinHash, isActive: true },
        create: { name: s.name.trim(), email: s.email, role: s.role, pinHash: s.pinHash, isActive: true },
      }),
    ),
    prisma.staff.updateMany({
      where: { id: { in: toDeactivate.map((s) => s.id) } },
      data: { isActive: false },
    }),
  ]);

  console.log(`\n✓ Saved ${rows.length} PINs and turned off ${toDeactivate.length} old account(s).`);
  console.log("Now delete staff-pins.json:  rm staff-pins.json");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
