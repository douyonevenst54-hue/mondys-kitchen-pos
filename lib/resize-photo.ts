/**
 * Shrink a photo in the browser before upload: a 4 MB phone photo becomes a
 * ~150 KB image, so the menu loads fast on mobile data. Keeps the photo
 * upright (phones store rotation separately) and its proportions.
 */

import { PHOTO_MAX_SIDE } from "@/lib/menu-photos";

export type ResizedPhoto = { blob: Blob; width: number; height: number };

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function resizePhoto(file: File): Promise<ResizedPhoto> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error("This photo format can't be opened here. Use a JPG or PNG photo.");
  }
  const w0 = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h0 = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w0 || !h0) throw new Error("This photo looks empty. Try another one.");

  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the photo on this device.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  // WebP is smallest; older Safari can't make WebP and silently gives PNG, so use JPEG there.
  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
  if (!blob) throw new Error("Couldn't prepare the photo on this device.");
  return { blob, width, height };
}
