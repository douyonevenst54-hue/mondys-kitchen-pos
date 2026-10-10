/**
 * Dish photos. The browser shrinks each photo before upload; the server only
 * accepts real JPEG, PNG or WebP images (checked by their first bytes, not by
 * what the browser claims) up to MAX_PHOTO_BYTES.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // after resizing photos are ~100–300 KB
export const PHOTO_MAX_SIDE = 1200; // px, longest side after resizing

/** Detect the real image type from the file's first bytes. */
export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Public address of a dish photo. `v` changes on every upload so caches refresh. */
export function photoUrl(menuItemId: string, version: Date | number = Date.now()): string {
  const v = (typeof version === "number" ? version : version.getTime()).toString(36);
  return `/order/photo/${menuItemId}?v=${v}`;
}
