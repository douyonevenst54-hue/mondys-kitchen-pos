import { ean13Modules, asEan13 } from "@/lib/ean13";

/**
 * EAN-13 barcode for stickers. Each bar is a whole number of printer dots
 * (203 dpi thermal printers: 3 dots per module, 2 on small stickers), so
 * every bar prints the same width and scans reliably. Guard bars run longer
 * like on store products; the digits are printed underneath.
 */
export const DOT = 1 / 203; // inch

export function Ean13({ code, dots = 3, heightIn = 0.42 }: { code: string; dots?: 2 | 3; heightIn?: number }) {
  const ean = asEan13(code);
  if (!ean) return <p style={{ fontSize: "8pt" }}>{code}</p>;
  const m = ean13Modules(ean);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const quiet = 9; // white margin scanners need on each side
  const width = 95 + quiet * 2;
  const widthIn = width * dots * DOT;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < 95; i++) {
    if (m[i] !== "1") continue;
    bars.push(<rect key={i} x={quiet + i} y={0} width={1} height={guard.has(i) ? 100 : 90} />);
  }
  return (
    <div style={{ width: `${widthIn}in` }} className="mx-auto">
      <svg
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        style={{ width: `${widthIn}in`, height: `${heightIn}in`, display: "block" }}
        role="img"
        aria-label={`Barcode ${ean}`}
        shapeRendering="crispEdges"
      >
        <rect width={width} height={100} fill="#fff" />
        <g fill="#000">{bars}</g>
      </svg>
      <p className="text-center font-mono leading-none" style={{ fontSize: dots === 2 ? "5.5pt" : "6.5pt", letterSpacing: "0.08em" }}>
        {ean[0]} {ean.slice(1, 7)} {ean.slice(7)}
      </p>
    </div>
  );
}
