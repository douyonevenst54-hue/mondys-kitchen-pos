import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { PhotoBoard } from "@/components/menu/PhotoBoard";

export default async function PhotosPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      menuItems: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, menuNumber: true, imageUrl: true, showOnRegister: true, showOnline: true },
      },
    },
  });

  return (
    <PhotoBoard
      categories={categories
        .filter((c) => c.menuItems.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          items: c.menuItems.map((i) => ({
            id: i.id,
            name: i.name,
            number: i.menuNumber,
            imageUrl: i.imageUrl,
            hidden: !i.showOnRegister && !i.showOnline,
          })),
        }))}
    />
  );
}
