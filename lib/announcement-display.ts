/** Labels and date text for PS Club posts (safe for browser code). */

export const KIND_LABEL = {
  DRAW: "Giveaway draw",
  WINNER: "Winner",
  NEWS: "News",
} as const;

/** "Saturday, October 17" from "2026-10-17" (a calendar day, no timezone shift). */
export function longDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** "Oct 17" from "2026-10-17". */
export function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
