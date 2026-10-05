/**
 * The restaurant's calendar date ("YYYY-MM-DD") in its own timezone.
 *
 * Vercel servers run in UTC, so `new Date().setHours(0,0,0,0)` gives the UTC
 * day — after 8 PM in Massachusetts that is already tomorrow. Portion counts
 * use this helper so evening sales land on the right day.
 */
export function businessDate(
  timezone = "America/New_York",
  at: Date = new Date(),
): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function isBusinessDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** Shift a YYYY-MM-DD string by whole days. */
export function addDays(value: string, days: number): string {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
