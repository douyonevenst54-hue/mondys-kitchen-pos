import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MondysEmblem } from "@/components/login/MondysEmblem";
import { resolveLogoUrl } from "@/lib/logo";
import Image from "next/image";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
};

export function OrdersPageHeader({
  title,
  subtitle,
  backHref = "/",
  backLabel = "Back to POS",
}: Props) {
  const logoUrl = resolveLogoUrl();
  return (
    <header className="flex items-center justify-between border-b border-mondy-border bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt="Mondy's Kitchen"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
        ) : (
          <MondysEmblem size={32} className="text-mondy-red" />
        )}
        <div className="leading-tight">
          <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-mondy-red-dark">
            {subtitle ?? "Mondy's Kitchen"}
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