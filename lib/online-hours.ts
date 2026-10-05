const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type OpenState =
  | { open: true; closesAt: string }
  | { open: false; message: string };

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Is online ordering open right now, in the restaurant's timezone?
 *
 * businessHours shape: { monday: "11:00-21:00" | null, ... } (null = closed).
 * If hours were never set, ordering is open whenever it isn't paused.
 * Orders stop being accepted `prepMinutes` before closing, so the last
 * order can still be ready before the doors lock.
 */
export function onlineOpenState(opts: {
  paused: boolean;
  businessHours: Record<string, string | null> | null;
  timezone: string;
  prepMinutes: number;
  now?: Date;
}): OpenState {
  if (opts.paused) {
    return { open: false, message: "Online ordering is paused right now. Please call the restaurant." };
  }
  if (!opts.businessHours) return { open: true, closesAt: "" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(opts.now ?? new Date());
  const weekday = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  const nowMin = hour * 60 + minute;

  const todayIdx = DAYS.indexOf(weekday as (typeof DAYS)[number]);
  const range = opts.businessHours[weekday];

  if (range) {
    const [start, end] = range.split("-");
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const lastOrderMin = eh * 60 + em - opts.prepMinutes;
    if (nowMin >= startMin && nowMin < lastOrderMin) {
      return { open: true, closesAt: to12h(end) };
    }
    if (nowMin < startMin) {
      return { open: false, message: `Online ordering opens today at ${to12h(start)}.` };
    }
  }

  // Find the next open day.
  for (let i = 1; i <= 7; i++) {
    const day = DAYS[(todayIdx + i) % 7];
    const next = opts.businessHours[day];
    if (next) {
      const label = i === 1 ? "tomorrow" : day[0].toUpperCase() + day.slice(1);
      return {
        open: false,
        message: `We're closed for online orders. We open ${label} at ${to12h(next.split("-")[0])}.`,
      };
    }
  }
  return { open: false, message: "Online ordering is closed." };
}
