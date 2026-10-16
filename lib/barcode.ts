/**
 * Barcodes on packaged items (UPC-A, EAN-13, EAN-8, Code 128…).
 * The same can reads as 12 digits (UPC-A) on one scanner and 13 (EAN-13,
 * with a leading 0) on another, so codes are stored in one canonical form
 * and matched in both. Shared by the register (browser) and the server.
 */

/** Strip spaces and odd characters; null if it doesn't look like a barcode. */
export function cleanBarcode(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-Z\-.]{4,32}$/.test(s)) return null;
  return s;
}

/** EAN-13 starting with 0 is the same product as its 12-digit UPC-A. */
export function canonicalBarcode(raw: string): string | null {
  const s = cleanBarcode(raw);
  if (!s) return null;
  if (/^0\d{12}$/.test(s)) return s.slice(1);
  return s;
}

/** Every form a stored code may have been saved in. */
export function barcodeVariants(raw: string): string[] {
  const c = canonicalBarcode(raw);
  if (!c) return [];
  return /^\d{12}$/.test(c) ? [c, `0${c}`] : [c];
}
