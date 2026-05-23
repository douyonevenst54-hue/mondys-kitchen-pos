import "server-only";
import fs from "node:fs";
import path from "node:path";

const CANDIDATE_FILES = [
  "mondys-logo.png",
  "mondys-logo.svg",
  "mondys-logo.jpg",
  "mondys-logo.jpeg",
  "mondys-logo.webp",
];

/**
 * Returns the public URL for the Mondy's logo if a file is present in /public,
 * or null if not. Used to choose between the real logo image and the fallback
 * SVG emblem.
 */
export function resolveLogoUrl(): string | null {
  const publicDir = path.join(process.cwd(), "public");
  for (const filename of CANDIDATE_FILES) {
    if (fs.existsSync(path.join(publicDir, filename))) {
      return `/${filename}`;
    }
  }
  return null;
}
