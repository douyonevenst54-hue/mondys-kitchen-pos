import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { BarcodeBoard } from "@/components/menu/BarcodeBoard";

export const metadata: Metadata = { title: "Barcodes · Rosewood Cafe", robots: { index: false } };

export default async function BarcodesPage() {
  await connection();
  if (!(await getManagerFromSession())) redirect("/");
  const items = await prisma.menuItem.findMany({
    where: { isActive: true, barcode: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true, barcode: true, showOnRegister: true, category: { select: { name: true } } },
  });
  return (
    <BarcodeBoard
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        barcode: i.barcode!,
        section: i.category.name,
        onRegister: i.showOnRegister,
      }))}
    />
  );
}
