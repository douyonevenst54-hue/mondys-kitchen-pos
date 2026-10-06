import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

export type ManagerStaff = { id: string; name: string; role: "OWNER" | "MANAGER" };

/**
 * Returns the logged-in staff member if they are an active OWNER or MANAGER,
 * otherwise null.
 *
 * The cookie is signed, and on top of that the role is read from the
 * database, so a deactivated or demoted staff member loses access right away
 * instead of when their cookie expires.
 */
export async function getManagerFromSession(): Promise<ManagerStaff | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;

  const staffId = (await verifySession(raw))?.staffId;
  if (!staffId) return null;

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

  const staffId = (await verifySession(raw))?.staffId;
  if (!staffId) return null;

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!staff || !staff.isActive) return null;
  return { id: staff.id, name: staff.name, role: staff.role };
}
