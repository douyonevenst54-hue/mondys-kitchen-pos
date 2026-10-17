import Link from "next/link";
import { getBrand } from "@/lib/brand";
import { ArrowLeft } from "lucide-react";
import { resolveLogoUrl } from "@/lib/logo";
import Image from "next/image";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
};

export async function OrdersPageHeader({
  title,
  subtitle,
  backHref = "/",
  backLabel = "Back to POS",
}: Props) {
  const logoUrl = resolveLogoUrl();
  const brand = await getBrand();
  return (
    <header className="flex items-center justify-between border-b border-mondy-border bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={brand.name}
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
        )}
        <div className="leading-tight">
          <p className="font-sans text-xs font-semibold text-mondy-red-dark">
            {subtitle ?? brand.name}
          </p>
          <h1 className="font-display text-lg font-bold text-mondy-ink">
            {title}
          </h1>
        </div>
      </div>
      <Link
        href={backHref}
        className="flex items-center gap-1.5 rounded-lg bg-mondy-cream px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
    </header>
  );
}