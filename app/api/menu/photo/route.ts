import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { MAX_PHOTO_BYTES, photoUrl, sniffImageType } from "@/lib/menu-photos";

/**
 * Upload or remove a dish photo (owner/manager only).
 *   POST   form-data: itemId, photo (file), width, height
 *   DELETE ?itemId=…
 * A route handler rather than a server action because photos can be larger
 * than the 1 MB server-action limit.
 */

const ID = /^[a-z0-9]{8,40}$/i;

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Only accept requests sent by our own pages (blocks cross-site form posts). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers may omit it
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

function refresh() {
  revalidatePath("/order");
  revalidatePath("/menu/photos");
  revalidatePath("/");
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Not allowed" }, 403);
  const manager = await getManagerFromSession();
  if (!manager) return json({ ok: false, error: "Only an owner or manager can change photos" }, 403);

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + 64 * 1024) return json({ ok: false, error: "That photo is too large" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Couldn't read the upload" }, 400);
  }
  const itemId = String(form.get("itemId") ?? "");
  const file = form.get("photo");
  if (!ID.test(itemId) || !(file instanceof Blob)) return json({ ok: false, error: "Invalid request" }, 400);
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return json({ ok: false, error: "That photo is too large" }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return json({ ok: false, error: "Use a JPG, PNG or WebP photo" }, 415);

  const clamp = (v: FormDataEntryValue | null) => Math.max(1, Math.min(10000, Math.round(Number(v) || 1)));
  const width = clamp(form.get("width"));
  const height = clamp(form.get("height"));

  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) return json({ ok: false, error: "Dish not found" }, 404);

  const url = photoUrl(itemId);
  await prisma.$transaction([
    prisma.menuPhoto.upsert({
      where: { menuItemId: itemId },
      update: { data: bytes, contentType, width, height },
      create: { menuItemId: itemId, data: bytes, contentType, width, height },
    }),
    prisma.menuItem.update({ where: { id: itemId }, data: { imageUrl: url } }),
  ]);
  refresh();
  return json({ ok: true, imageUrl: url });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Not allowed" }, 403);
  const manager = await getManagerFromSession();
  if (!manager) return json({ ok: false, error: "Only an owner or manager can change photos" }, 403);

  const itemId = new URL(req.url).searchParams.get("itemId") ?? "";
  if (!ID.test(itemId)) return json({ ok: false, error: "Invalid request" }, 400);

  await prisma.$transaction([
    prisma.menuPhoto.deleteMany({ where: { menuItemId: itemId } }),
    prisma.menuItem.updateMany({ where: { id: itemId }, data: { imageUrl: null } }),
  ]);
  refresh();
  return json({ ok: true });
}
