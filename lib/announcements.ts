import "server-only";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/business-date";

/**
 * PS Club (Passport Special Club) announcements: giveaway draws, winners and
 * news shown in a corner of the online order page.
 *
 * A post is live when it's published, its first day has arrived, and its
 * last day (if any) hasn't passed — all in the restaurant's own calendar.
 */

export type AnnouncementKind = "DRAW" | "WINNER" | "NEWS";

export type PublicAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  eventDate: string | null;
  isPinned: boolean;
};

export type ManagedAnnouncement = PublicAnnouncement & {
  showFrom: string;
  showUntil: string | null;
  isPublished: boolean;
  status: "live" | "scheduled" | "ended" | "hidden";
  createdBy: string | null;
  updatedAt: string;
};

/** Most posts the customer corner shows at once (pinned first). */
export const MAX_PUBLIC = 6;

export function statusOf(
  a: { isPublished: boolean; showFrom: string; showUntil: string | null },
  today: string,
): ManagedAnnouncement["status"] {
  if (!a.isPublished) return "hidden";
  if (a.showFrom > today) return "scheduled";
  if (a.showUntil && a.showUntil < today) return "ended";
  return "live";
}

const ORDER = [{ isPinned: "desc" as const }, { showFrom: "desc" as const }, { createdAt: "desc" as const }];

/** What customers see right now. */
export async function getLiveAnnouncements(timezone = "America/New_York"): Promise<PublicAnnouncement[]> {
  const today = businessDate(timezone);
  try {
    return await prisma.announcement.findMany({
      where: {
        isPublished: true,
        showFrom: { lte: today },
        OR: [{ showUntil: null }, { showUntil: { gte: today } }],
      },
      orderBy: ORDER,
      take: MAX_PUBLIC,
      select: { id: true, kind: true, title: true, body: true, eventDate: true, isPinned: true },
    });
  } catch (e) {
    // Never let the club corner take down ordering (e.g. table not created yet).
    console.error("PS Club posts unavailable:", e);
    return [];
  }
}

/** Everything, for the manager screen. */
export async function getAllAnnouncements(timezone = "America/New_York"): Promise<ManagedAnnouncement[]> {
  const today = businessDate(timezone);
  const rows = await prisma.announcement.findMany({
    orderBy: ORDER,
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    eventDate: r.eventDate,
    isPinned: r.isPinned,
    showFrom: r.showFrom,
    showUntil: r.showUntil,
    isPublished: r.isPublished,
    status: statusOf(r, today),
    createdBy: r.createdBy?.name ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
