// Inline SVG component for the Mondy's Kitchen emblem.
// Stroke/fill use currentColor so we can theme it from a parent's text-color.

type Props = {
  className?: string;
  size?: number;
};

export function MondysEmblem({ className, size = 96 }: Props) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mondy's Kitchen"
      role="img"
    >
      {/* Rising steam — three curls */}
      <path
        d="M85 70 Q78 55 88 42 Q98 30 90 18"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M105 72 Q98 58 108 46 Q118 34 110 22"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M125 70 Q118 56 128 44 Q138 32 130 20"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Sprinkles / seasoning above plate */}
      <circle cx="72" cy="88" r="2.5" fill="currentColor" />
      <circle cx="80" cy="82" r="1.8" fill="currentColor" />
      <circle cx="92" cy="92" r="2.2" fill="currentColor" />
      <circle cx="108" cy="86" r="1.8" fill="currentColor" />
      <circle cx="120" cy="92" r="2.5" fill="currentColor" />
      <circle cx="132" cy="84" r="1.8" fill="currentColor" />

      {/* Small star sparkles */}
      <path
        d="M65 78 L67 80 L69 78 L67 76 Z"
        fill="currentColor"
      />
      <path
        d="M138 76 L140 78 L142 76 L140 74 Z"
        fill="currentColor"
      />

      {/* The plate — oval with brushy outer ring */}
      <ellipse
        cx="100"
        cy="125"
        rx="58"
        ry="14"
        fill="currentColor"
        opacity="0.95"
      />
      <ellipse
        cx="100"
        cy="123"
        rx="48"
        ry="9"
        fill="var(--color-mondy-cream, #fef9ec)"
      />
      {/* Inner food smear */}
      <ellipse
        cx="100"
        cy="123"
        rx="38"
        ry="5"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}
