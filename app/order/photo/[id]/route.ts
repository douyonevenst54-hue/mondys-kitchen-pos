import { prisma } from "@/lib/prisma";

/**
 * Serves a dish photo to anyone (it's on the public menu). The address
 * carries a version (?v=…) that changes with every upload, so browsers and
 * Vercel's CDN can keep each version for a year.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{8,40}$/i.test(id)) return new Response("Not found", { status: 404 });

  const photo = await prisma.menuPhoto.findUnique({
    where: { menuItemId: id },
    select: { data: true, contentType: true },
  });
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
