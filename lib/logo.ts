import "server-only";
import fs from "node:fs";
import path from "node:path";

// Rosewood Cafe logo, if one is added to /public later. The old
// mondys-logo.* files are ignored so the old brand doesn't reappear;
// without a file, screens show the "ROSEWOOD CAFE / by Mondy's" wordmark.
const CANDIDATE_FILES = [
  "rosewood-logo.png",
  "rosewood-logo.svg",
  "rosewood-logo.jpg",
  "rosewood-logo.jpeg",
  "rosewood-logo.webp",
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
