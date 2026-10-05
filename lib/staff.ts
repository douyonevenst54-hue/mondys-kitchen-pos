import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type ManagerStaff = { id: string; name: string; role: "OWNER" | "MANAGER" };

/**
 * Returns the logged-in staff member if they are an active OWNER or MANAGER,
 * otherwise null.
 *
 * The session cookie is plain JSON, so its `role` field can be edited in the
 * browser. We only take the staffId from the cookie and read the role from the
 * database, so a cashier can't promote themselves by editing the cookie.
 */
export async function getManagerFromSession(): Promise<ManagerStaff | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;

  let staffId: unknown;
  try {
    staffId = (JSON.parse(raw) as { staffId?: unknown }).staffId;
  } catch {
    return null;
  }
  if (typeof staffId !== "string" || staffId.length === 0) return null;

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!staff || !staff.isActive) return null;
  if (staff.role !== "OWNER" && staff.role !== "MANAGER") return null;

  return { id: staff.id, name: staff.name, role: staff.role };
}

export type SessionStaff = { id: string; name: string; role: string };

/** Any active, logged-in staff member, verified against the database. */
export async function getStaffFromSession(): Promise<SessionStaff | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;

  let staffId: unknown;
  try {
    staffId = (JSON.parse(raw) as { staffId?: unknown }).staffId;
  } catch {
    return null;
  }
  if (typeof staffId !== "string" || staffId.length === 0) return null;

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!staff || !staff.isActive) return null;
  return { id: staff.id, name: staff.name, role: staff.role };
}
