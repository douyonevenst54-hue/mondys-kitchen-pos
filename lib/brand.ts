import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildBrand, type Brand } from "@/lib/brand-shared";

/** The brand for this request (one database read, shared by everything on the page). */
export const getBrand = cache(async (): Promise<Brand> => {
  try {
    const s = await prisma.restaurantSettings.findFirst({
      select: { name: true, brandName: true, brandTagline: true, brandColor: true, clubName: true, rewardsName: true },
    });
    return buildBrand(s ?? { name: "Our Restaurant" });
  } catch {
    // Database unreachable (e.g. while building): neutral defaults.
    return buildBrand({ name: "Our Restaurant" });
  }
});
