import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { getSettings } from "@/lib/menu";
import { businessDate } from "@/lib/business-date";
import { LabelBoard } from "@/components/menu/LabelBoard";

export const metadata: Metadata = { title: "Barcode stickers" };

export default async function LabelsPage() {
  if (!(await getManagerFromSession())) redirect("/");
  const [settings, row, categories] = await Promise.all([
    getSettings(),
    prisma.restaurantSettings.findFirst({ select: { labelSize: true } }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        menuItems: {
          where: { isActive: true, price: { gt: 0 } },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, price: true, barcode: true },
        },
      },
    }),
  ]);
  return (
    <LabelBoard
      sections={categories
        .filter((c) => c.menuItems.length)
        .map((c) => ({ name: c.name, items: c.menuItems.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), barcode: i.barcode })) }))}
      initialSize={row?.labelSize ?? "2.25x1.25"}
      today={businessDate(settings.timezone)}
    />
  );
}
