import { Phone } from "lucide-react";

/** "(978) 880-2152" → "tel:+19788802152" so every phone dials it correctly. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits || phone}`;
}

/**
 * Tap to call the restaurant. "button" is the big pill on the menu and the
 * order status page; "link" sits inside a sentence.
 */
export function CallButton({
  phone,
  variant = "button",
  className = "",
}: {
  phone: string;
  variant?: "button" | "link";
  className?: string;
}) {
  if (variant === "link") {
    return (
      <a
        href={telHref(phone)}
        className={`inline-flex min-h-11 items-center gap-1 font-semibold text-mondy-red-dark underline underline-offset-2 ${className}`}
      >
        <Phone className="h-4 w-4" aria-hidden />
        Call {phone}
      </a>
    );
  }
  return (
    <a
      href={telHref(phone)}
      className={`inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-mondy-ink ring-1 ring-mondy-border transition hover:ring-mondy-red/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 ${className}`}
    >
      <Phone className="h-5 w-5 text-mondy-red" aria-hidden />
      Call {phone}
    </a>
  );
}
