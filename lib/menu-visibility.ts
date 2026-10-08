/**
 * Rules for which dishes appear where. Shared by the register, the customer
 * order page, both checkouts, and the Daily menu screen so they always agree.
 *
 * A dish shows on a channel (register or online) when ALL of these are true:
 *   1. It isn't deleted (isActive)
 *   2. A manager hasn't hidden it on that channel (showOnRegister / showOnline)
 *   3. It's on today's weekly schedule (serveDays)
 *   4. It has a price (new dishes start at 0 = "needs a price")
 *   5. It isn't sold out, OR the restaurant chose to still show sold-out dishes
 */

export const ALL_DAYS = 127;

/** Display order Monday → Sunday; values are JS getDay() numbers (0 = Sunday). */
export const WEEK = [
  { day: 1, short: "Mon", letter: "M", long: "Monday" },
  { day: 2, short: "Tue", letter: "T", long: "Tuesday" },
  { day: 3, short: "Wed", letter: "W", long: "Wednesday" },
  { day: 4, short: "Thu", letter: "T", long: "Thursday" },
  { day: 5, short: "Fri", letter: "F", long: "Friday" },
  { day: 6, short: "Sat", letter: "S", long: "Saturday" },
  { day: 0, short: "Sun", letter: "S", long: "Sunday" },
] as const;

export function servedOn(serveDays: number, weekday: number): boolean {
  return (serveDays & (1 << weekday)) !== 0;
}

export function withDay(serveDays: number, weekday: number, served: boolean): number {
  return served ? serveDays | (1 << weekday) : serveDays & ~(1 << weekday);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Today's weekday (0 = Sunday) in the restaurant's timezone, not the server's. */
export function weekdayIn(timezone = "America/New_York", at: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(at);
  return WEEKDAY_INDEX[short] ?? at.getDay();
}

type ItemFlags = {
  price: number | { valueOf(): string | number }; // Prisma Decimal or number
  isActive: boolean;
  isAvailable: boolean;
  portionsLeft: number | null;
  showOnRegister: boolean;
  showOnline: boolean;
  serveDays: number;
};

/** New dishes start at $0 until a manager sets a price. */
export function needsPrice(item: Pick<ItemFlags, "price">): boolean {
  return !(Number(item.price) > 0);
}

export function isSoldOut(item: Pick<ItemFlags, "isAvailable" | "portionsLeft">): boolean {
  return !item.isAvailable || (item.portionsLeft !== null && item.portionsLeft <= 0);
}

/** Should this dish be listed on the channel today? */
export function isListed(
  item: ItemFlags,
  channel: "register" | "online",
  weekday: number,
  hideSoldOut: boolean,
): boolean {
  if (!item.isActive) return false;
  if (needsPrice(item)) return false;
  if (channel === "register" ? !item.showOnRegister : !item.showOnline) return false;
  if (!servedOn(item.serveDays, weekday)) return false;
  if (hideSoldOut && isSoldOut(item)) return false;
  return true;
}

/** Can this dish be ordered on the channel right now? (Listed AND not sold out.) */
export function isOrderable(item: ItemFlags, channel: "register" | "online", weekday: number): boolean {
  return isListed(item, channel, weekday, true);
}
