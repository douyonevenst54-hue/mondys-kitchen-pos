import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { IdleLogout } from "@/components/IdleLogout";
import { IDLE_MINUTES } from "@/lib/session";
import { PUBLIC_ORDER_HOSTS } from "@/lib/public-hosts";
import { connection } from "next/server";
import { getBrand } from "@/lib/brand";
import { brandCssVars } from "@/lib/brand-shared";
import { BrandProvider } from "@/components/brand/BrandProvider";

// Bold grotesk close to the printed menu's Helvetica headings.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

// Page titles read "Kitchen · <business name>"; the name comes from settings.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: `Order online from ${brand.name}.`,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Brand settings can change anytime, so pages are never frozen at build time.
  await connection();
  const brand = await getBrand();
  return (
    <html lang="en" className={archivo.variable} style={brandCssVars(brand.color) as React.CSSProperties}>
      <body>
        <BrandProvider brand={brand}>{children}</BrandProvider>
        <IdleLogout idleMinutes={IDLE_MINUTES} publicHosts={PUBLIC_ORDER_HOSTS} />
      </body>
    </html>
  );
}
