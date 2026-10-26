// App icon: a red cap on a white baseball diamond, on navy. Full-bleed square (phones
// round the corners); the artwork stays inside the central safe zone for round masks.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
<rect width="160" height="160" fill="#0b1f3a"/>
<polygon points="80,30 128,78 80,126 32,78" fill="none" stroke="#ffffff" stroke-width="4"/>
<rect x="74" y="24" width="12" height="12" fill="#ffffff" transform="rotate(45 80 30)"/>
<rect x="122" y="72" width="12" height="12" fill="#ffffff" transform="rotate(45 128 78)"/>
<rect x="26" y="72" width="12" height="12" fill="#ffffff" transform="rotate(45 32 78)"/>
<polygon points="72,121 88,121 88,129 80,137 72,129" fill="#ffffff"/>
<g transform="translate(75,88) scale(0.6)">
<path d="M-45 10 A45 42 0 0 1 45 10 Z" fill="#c8102e"/>
<path d="M30 10 L80 10 Q84 22 64 25 L30 18 Z" fill="#c8102e"/>
<path d="M0 -31 L0 10 M-20 -26 Q-26 -8 -24 10 M20 -26 Q26 -8 24 10" fill="none" stroke="#8f0b20" stroke-width="3"/>
<line x1="-45" y1="10" x2="45" y2="10" stroke="#ffffff" stroke-width="3"/>
<circle cx="0" cy="-32" r="6" fill="#ffffff"/>
</g>
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
