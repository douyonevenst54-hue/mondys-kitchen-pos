import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { IdleLogout } from "@/components/IdleLogout";
import { IDLE_MINUTES } from "@/lib/session";

// Bold grotesk close to the printed menu's Helvetica headings.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rosewood Cafe by Mondy's",
  description: "Breakfast, bowls, grill favorites, coffee and smoothies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        {children}
        <IdleLogout idleMinutes={IDLE_MINUTES} />
      </body>
    </html>
  );
}
