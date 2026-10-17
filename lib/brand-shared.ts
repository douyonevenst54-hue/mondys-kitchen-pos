/**
 * The business's brand, shared by server and browser code. Every name and
 * the main color come from Online settings > Brand, so the same app can run
 * for any restaurant.
 */
export type Brand = {
  /** Full business name: page titles, emails, receipts ("Rosewood Cafe by Mondy's"). */
  name: string;
  /** Big wordmark line ("Rosewood Cafe"). */
  wordmark: string;
  /** Small line under the wordmark ("by Mondy's"), or null. */
  tagline: string | null;
  /** Main color (hex). */
  color: string;
  clubName: string;
  rewardsName: string;
  signatureLabel: string;
};

export const DEFAULT_BRAND_COLOR = "#8b5e3c";

export function buildBrand(s: {
  name: string;
  brandName?: string | null;
  brandTagline?: string | null;
  brandColor?: string | null;
  clubName?: string | null;
  rewardsName?: string | null;
}): Brand {
  const wordmark = s.brandName?.trim() || s.name;
  return {
    name: s.name,
    wordmark,
    tagline: s.brandTagline?.trim() || null,
    color: isHexColor(s.brandColor) ? s.brandColor!.toLowerCase() : DEFAULT_BRAND_COLOR,
    clubName: s.clubName?.trim() || "News & specials",
    rewardsName: s.rewardsName?.trim() || `${wordmark} Rewards`,
    signatureLabel: `${wordmark} Signature`,
  };
}

export function isHexColor(v: string | null | undefined): boolean {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** WCAG contrast of white text on this color (buttons are white on the main color). */
export function contrastWithWhite(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (L + 0.05);
}

/** CSS variables that recolor the whole app from one main color. */
export function brandCssVars(color: string): Record<string, string> {
  return {
    "--color-mondy-red": color,
    "--color-mondy-red-dark": `color-mix(in oklab, ${color} 78%, black)`,
    "--color-mondy-red-soft": `color-mix(in oklab, ${color} 62%, white)`,
  };
}
