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

// ─────────────────────────────────────────────────────────────────────────────
// Pickup times: "as soon as possible", or a time later today in 15-minute
// steps, from (now + prep time) until closing. All in the restaurant's
// timezone. The server recomputes this list and only accepts a time on it.
// ─────────────────────────────────────────────────────────────────────────────

export type PickupSlot = { value: string; label: string }; // value "2026-10-15T13:30" (restaurant time)

const STEP = 15;

function localParts(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday").toLowerCase(),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function slotsBetween(ymd: string, from: number, to: number): PickupSlot[] {
  const first = Math.ceil(from / STEP) * STEP;
  const slots: PickupSlot[] = [];
  for (let m = first; m <= to; m += STEP) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    slots.push({ value: `${ymd}T${hh}:${mm}`, label: to12h(`${hh}:${mm}`) });
  }
  return slots;
}

function parseRange(range: string): { open: number; close: number } {
  const [s, e] = range.split("-");
  const [sh, sm] = s.split(":").map(Number);
  const [eh, em] = e.split(":").map(Number);
  return { open: sh * 60 + sm, close: eh * 60 + em };
}

/** Today's pickup times, from (now + prep) until closing. */
export function pickupSlots(opts: {
  businessHours: Record<string, string | null> | null;
  timezone: string;
  prepMinutes: number;
  now?: Date;
}): PickupSlot[] {
  const now = localParts(opts.timezone, opts.now ?? new Date());
  let open = 0;
  let close = 24 * 60 - STEP;
  if (opts.businessHours) {
    const range = opts.businessHours[now.weekday];
    if (!range) return [];
    ({ open, close } = parseRange(range));
  } else {
    close = Math.min(close, now.minutes + 8 * 60); // no hours set: up to 8 hours ahead
  }
  // A scheduled time must be later than "as soon as possible".
  const earliest = Math.max(open + opts.prepMinutes, now.minutes + opts.prepMinutes + STEP);
  return slotsBetween(now.ymd, earliest, close);
}

export type PickupDay = {
  ymd: string; // "2026-10-16"
  weekday: number; // 0 = Sunday
  label: string; // "Today", "Tomorrow", "Monday"
  dateLabel: string; // "Fri, Oct 16"
  isToday: boolean;
  slots: PickupSlot[];
};

/**
 * Days a customer can pick up: today (while ordering is open) and, when
 * pre-orders are on, the next day the restaurant opens. Only days with
 * business hours set get pre-orders, so the kitchen always knows the hours.
 */
export function pickupDays(opts: {
  businessHours: Record<string, string | null> | null;
  timezone: string;
  prepMinutes: number;
  openNow: boolean;
  allowPreorders: boolean;
  now?: Date;
}): PickupDay[] {
  const at = opts.now ?? new Date();
  const now = localParts(opts.timezone, at);
  const [y, m, d] = now.ymd.split("-").map(Number);
  const dayAt = (offset: number) => {
    const u = new Date(Date.UTC(y, m - 1, d + offset, 12));
    const ymd = u.toISOString().slice(0, 10);
    const weekday = u.getUTCDay();
    const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(u);
    return { ymd, weekday, dateLabel };
  };

  const days: PickupDay[] = [];
  if (opts.openNow) {
    const today = dayAt(0);
    days.push({ ...today, label: "Today", isToday: true, slots: pickupSlots(opts) });
  }
  if (opts.allowPreorders && opts.businessHours) {
    // Before opening, "later today" counts as the pre-order day.
    for (let i = opts.openNow ? 1 : 0; i <= 7; i++) {
      const day = dayAt(i);
      const range = opts.businessHours[DAYS[day.weekday]];
      if (!range) continue;
      const { open, close } = parseRange(range);
      const from = i === 0 ? Math.max(open + opts.prepMinutes, now.minutes + opts.prepMinutes + STEP) : open + opts.prepMinutes;
      const slots = slotsBetween(day.ymd, from, close);
      if (!slots.length) continue;
      const label =
        i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[day.weekday][0].toUpperCase() + DAYS[day.weekday].slice(1);
      days.push({ ...day, label, isToday: i === 0, slots });
      break; // just the next open day
    }
  }
  return days.filter((x) => x.slots.length > 0 || x.isToday);
}

/** "2026-10-15T13:30" in the restaurant's timezone → the real moment (UTC). */
export function restaurantTimeToDate(value: string, timezone: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  // Two passes handle daylight-saving changes.
  for (let i = 0; i < 2; i++) {
    const p = localParts(timezone, new Date(guess));
    const [py, pm, pd] = p.ymd.split("-").map(Number);
    const shown = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    guess += target - shown;
  }
  return new Date(guess);
}

/** True when a pickup time falls on a later calendar day than today (restaurant time). */
export function isForLaterDay(at: Date | null | undefined, timezone: string, now: Date = new Date()): boolean {
  if (!at) return false;
  return localParts(timezone, at).ymd > localParts(timezone, now).ymd;
}
