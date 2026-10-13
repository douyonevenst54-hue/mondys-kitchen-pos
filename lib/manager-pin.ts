import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Check a manager/owner PIN typed on the register, with the same lockout as
 * the login screen: 5 wrong PINs from one signed-in staff member locks
 * manager approval for 15 minutes, so nobody can guess their way through.
 */

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function checkManagerPin(
  pin: string,
  askedBy: string,
): Promise<{ ok: true; staffId: string; name: string } | { ok: false; error: string }> {
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "Enter a manager PIN" };

  const key = `mgrpin:${askedBy}`;
  const t = await prisma.loginThrottle.findUnique({ where: { key } });
  if (t?.lockedUntil && t.lockedUntil > new Date()) {
    const mins = Math.ceil((t.lockedUntil.getTime() - Date.now()) / 60_000);
    return { ok: false, error: `Too many wrong PINs. Try again in ${mins} min.` };
  }

  const managers = await prisma.staff.findMany({
    where: { isActive: true, role: { in: ["OWNER", "MANAGER"] } },
    select: { id: true, name: true, pinHash: true },
  });
  for (const m of managers) {
    if (await bcrypt.compare(pin, m.pinHash)) {
      if (t) await prisma.loginThrottle.delete({ where: { key } }).catch(() => undefined);
      return { ok: true, staffId: m.id, name: m.name };
    }
  }

  const failures = (t?.failures ?? 0) + 1;
  await prisma.loginThrottle.upsert({
    where: { key },
    update: {
      failures,
      lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    },
    create: { key, failures, lockedUntil: null },
  });
  return { ok: false, error: "That's not a manager PIN" };
}
