/**
 * "ROSEWOOD CAFE / by Mondy's", set like the printed menu's masthead:
 * heavy capitals, a small "by Mondy's" underneath. Pure text, so it prints
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
  return (
    <div className={`leading-none ${align === "center" ? "text-center" : "text-left"} ${className}`}>
      <p className={`font-display font-black uppercase tracking-[-0.01em] ${s.name}`}>
        Rosewood Cafe
      </p>
      <p className={`mt-1 font-sans font-medium opacity-70 ${s.by}`}>by Mondy&apos;s</p>
    </div>
  );
}
