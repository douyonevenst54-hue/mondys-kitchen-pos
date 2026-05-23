// Mondy's Kitchen logo component.
//
// USAGE: Drop a `mondys-logo.png` (or .svg, .jpg) into your project's `public/`
// folder, and this component will use it automatically. If no file exists,
// it falls back to the stylized inline SVG emblem.

import Image from "next/image";
import { MondysEmblem } from "./MondysEmblem";
import { resolveLogoUrl } from "@/lib/logo";

type Props = {
  className?: string;
  size?: number;
};

export function MondysLogo({ className, size = 140 }: Props) {
  const realLogo = resolveLogoUrl();

  if (realLogo) {
    return (
      <Image
        src={realLogo}
        alt="Mondy's Kitchen"
        width={size}
        height={size}
        priority
        className={className}
        style={{ height: size, width: "auto" }}
      />
    );
  }

  return <MondysEmblem className={className} size={size} />;
}
