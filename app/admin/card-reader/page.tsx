import { redirect } from "next/navigation";
import { getManagerFromSession } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import { getReaderInfo } from "@/lib/terminal";
import { getCardStatus } from "@/lib/stripe-config";
import { CardReaderSettings } from "@/components/admin/CardReaderSettings";

/** "12 Main St, Peabody, MA 01960" → parts, to prefill the address. */
function splitAddress(a: string | null) {
  const m = a?.match(/^\s*(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  return m ? { line1: m[1], city: m[2], state: m[3].toUpperCase(), postalCode: m[4] } : { line1: a ?? "", city: "", state: "MA", postalCode: "" };
}

export default async function CardReaderPage() {
  const manager = await getManagerFromSession();
  if (!manager) redirect("/");

  const card = getCardStatus();
  const [reader, settings] = await Promise.all([
    card.enabled ? getReaderInfo({ live: true }) : null,
    prisma.restaurantSettings.findFirst({ select: { address: true, terminalLocationId: true } }),
  ]);

  return (
    <CardReaderSettings
      stripeProblem={card.enabled ? null : card.problem}
      testMode={card.enabled ? card.mode === "test" : false}
      reader={reader}
      needsAddress={!settings?.terminalLocationId}
      address={splitAddress(settings?.address ?? null)}
    />
  );
}
