import "server-only";
import fs from "node:fs";
import path from "node:path";

// The business logo, if a file is added to /public (logo.png, logo.svg…).
// Without one, screens show the text wordmark from Brand settings.
// (rosewood-logo.* still works for the first install.)
const CANDIDATE_FILES = [
  "logo.png",
  "logo.svg",
  "logo.jpg",
  "logo.jpeg",
  "logo.webp",
  "rosewood-logo.png",
  "rosewood-logo.svg",
  "rosewood-logo.jpg",
  "rosewood-logo.jpeg",
  "rosewood-logo.webp",
];

/**
 * Returns the public URL for the business logo if a file is present in /public,
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
