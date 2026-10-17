"use client";

import { useBrand } from "./BrandProvider";

/**
 * The business name set like a printed menu's masthead: heavy capitals, the
 * tagline (e.g. "by Mondy's") small underneath. Both come from Brand settings. Pure text, so it prints
 * crisply on receipts and needs no image file.
 */
type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { name: string; by: string }> = {
  sm: { name: "text-base", by: "text-[10px]" },
  md: { name: "text-2xl", by: "text-xs" },
  lg: { name: "text-4xl sm:text-5xl", by: "text-sm" },
  xl: { name: "text-5xl sm:text-7xl", by: "text-base sm:text-lg" },
};

export function Wordmark({
  size = "md",
  align = "center",
  className = "",
}: {
  size?: Size;
  align?: "center" | "left";
  className?: string;
}) {
  const s = SIZES[size];
  const brand = useBrand();
  return (
    <div className={`leading-none ${align === "center" ? "text-center" : "text-left"} ${className}`}>
      <p className={`font-display font-black uppercase tracking-[-0.01em] ${s.name}`}>
        {brand.wordmark}
      </p>
      {brand.tagline && <p className={`mt-1 font-sans font-medium opacity-70 ${s.by}`}>{brand.tagline}</p>}
    </div>
  );
}
