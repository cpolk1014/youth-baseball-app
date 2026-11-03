import { BRAND_CRIMSON, CAP_MARK_SVG } from "@/lib/branding/brand-mark";

// App icon: the navy rally cap on crimson, from the brand kit. Full-bleed square (phones
// round the corners); the cap stays inside the central circle so round and maskable icons
// don't cut it off.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
<rect width="320" height="320" fill="${BRAND_CRIMSON}"/>
${CAP_MARK_SVG.replace("<svg ", '<svg x="-6" y="2" width="332" height="332" ').replace(/ width="320" height="320"/, "")}
</svg>`;

const ICON_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;

/** Rendered to PNG by next/og. */
export function AppIconArt({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
      <img src={ICON_SRC} width={size} height={size} alt="" />
    </div>
  );
}
