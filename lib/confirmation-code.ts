import { randomInt } from "node:crypto";

/**
 * Generate a short, human-readable confirmation code for online orders.
 *
 * Format: "MK-XXXXXX" — 6 random digits.
 *
 * - "MK-" prefix so it's recognizable as Mondy's Kitchen
 * - Digits only, no ambiguous characters; easy to read out at the counter
 * - 6 digits (900,000 codes) because the column is @unique for all time.
 *   With only 4 digits (9,000 codes) collisions would start failing orders
 *   after a few thousand online orders.
 * - crypto.randomInt, so codes can't be predicted from earlier ones
 *
 * The code is for reading out at pickup. The customer's status link uses the
 * order's id, which is long and unguessable.
 */
export function generateConfirmationCode(): string {
  return `MK-${randomInt(100000, 1000000)}`;
}

/**
 * Try to insert with a confirmation code, retrying with new codes on collision.
 */
export async function withUniqueConfirmationCode<T>(
  insertFn: (code: string) => Promise<T>,
  maxAttempts = 10,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateConfirmationCode();
    try {
      return await insertFn(code);
    } catch (err) {
      // P2002 = Prisma unique constraint violation
      const isUniqueViolation =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002";

      if (!isUniqueViolation) throw err;
      lastErr = err;
    }
  }
  throw new Error(
    `Could not generate unique confirmation code after ${maxAttempts} attempts: ${String(lastErr)}`,
  );
}
