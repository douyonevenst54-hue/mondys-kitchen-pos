import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { connection } from "next/server";
import { getSettings } from "@/lib/menu";
import { businessDate } from "@/lib/business-date";
import { ContactForms, type ContactTab } from "@/components/online/ContactForms";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: "Contact, catering & feedback", description: `Questions, catering for your event, or feedback for ${brand.name}.` };
}

type Search = Promise<{ type?: string; order?: string }>;

export default async function ContactPage({ searchParams }: { searchParams: Search }) {
  await connection();
  const { type, order } = await searchParams;
  const settings = await getSettings();
  const tab: ContactTab = type === "catering" ? "CATERING" : type === "feedback" ? "FEEDBACK" : "CONTACT";
  return (
    <ContactForms
      initialTab={tab}
      orderCode={order && /^MK-\d{6}$/i.test(order) ? order.toUpperCase() : ""}
      today={businessDate(settings.timezone)}
      restaurant={{ name: settings.name, phone: settings.phone, email: settings.email, address: settings.address }}
    />
  );
}
