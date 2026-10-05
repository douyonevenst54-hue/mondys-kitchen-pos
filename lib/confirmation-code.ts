/**
 * Generate a short, human-readable confirmation code for online orders.
 *
 * Format: "MK-XXXX" where XXXX is 4 random digits (1000-9999).
 *
 * Why this format:
 * - Prefixed "MK-" so it's recognizable as Mondy's Kitchen
 * - 4 digits is the sweet spot: short enough to read out loud over the phone,
 *   long enough to be reasonably unique (9000 possibilities)
 * - Numbers only — no ambiguous chars (O vs 0, I vs 1, S vs 5)
 * - Customer says "MK-4-8-2-9", cashier types it in, no confusion
 *
 * Uniqueness: caller is responsible for retrying on collision. Since the
 * confirmationCode column is @unique in the DB, an insert with a duplicate
 * code will fail loudly — caller should generate a new code and retry.
 */
export function generateConfirmationCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `MK-${digits}`;
}

/**
 * Try to insert with a confirmation code, retrying with new codes on collision.
 *
 * Most collisions clear in 1-2 retries (9000-code namespace is large for the
 * volume of orders we expect). Bail out after 10 tries — by then something is
 * very wrong (data corruption, clock skew, etc).
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