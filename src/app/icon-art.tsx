// App icon: the "vintage badge". A hand-inked baseball wearing a backwards rally cap
// (snapback strap to the front, bill to the back), on navy with a sunburst behind it.
// Full-bleed square (phones round the corners); the artwork stays inside the central
// circle (80% of the width) so round and maskable icons don't cut it off.
const INK = "#14233d";
const NAVY = "#0b1f3a";
const CREAM = "#f4ecdb";
const BALL = "#fffaf0";
const RED = "#c8102e";
const RED_DARK = "#9e0c24";

// One hand-sewn stitch (a V), placed along the seams.
const STITCHES: [number, number, number][] = [
  [-41.1, -32.6, -50],
  [-36.2, -21, -64],
  [-33.2, -8.6, -84],
  [-32.8, 8.2, -97],
  [-35.6, 20.6, -116],
  [-41.4, 32.2, -128],
  [41.3, -32.4, 52],
  [35.7, -20.6, 64],
  [33.1, -8.2, 83],
  [33.3, 8.6, 99],
  [36, 20.9, 114],
  [40.8, 32.8, 131],
];
const stitches = STITCHES.map(
  ([x, y, r]) =>
    `<path transform="translate(${x},${y}) rotate(${r})" d="M-6,-3.4 L0,1.6 L5.6,-2.8" fill="none" stroke="${RED}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
).join("");
const rays = Array.from(
  { length: 12 },
  (_, i) => `<polygon points="0,0 -28,-260 28,-260" transform="rotate(${i * 30})"/>`,
).join("");

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<defs>
<pattern id="dots" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.05" fill="${INK}"/></pattern>
</defs>
<rect width="300" height="300" fill="${NAVY}"/>
<g transform="translate(150,150)" fill="${CREAM}" opacity="0.09">${rays}</g>
<circle cx="150" cy="150" r="128" fill="none" stroke="${CREAM}" stroke-width="2" opacity="0.35" stroke-dasharray="2 7" stroke-linecap="round"/>
<g transform="translate(145,163) scale(1.15)">
<ellipse cx="2" cy="70" rx="48" ry="6.5" fill="#050d1a" opacity="0.7"/>
<path d="M-61,3 C-63,-34 -33,-63 2,-62 C36,-61 63,-35 62,0 C61,35 35,63 -1,62 C-36,61 -60,36 -61,3 Z" fill="${BALL}"/>
<path d="M54,-30 C64,8 44,50 -24,58 C10,60 52,40 60,4 C62,-10 59,-22 54,-30 Z" fill="url(#dots)" opacity="0.7"/>
<path d="M-61,3 C-63,-34 -33,-63 2,-62 C36,-61 63,-35 62,0 C61,35 35,63 -1,62 C-36,61 -60,36 -61,3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
<path d="M-57,-18 C-48,-46 -20,-63 12,-60" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
<path d="M-46,-41 C-29,-17 -27.5,15 -45,40" fill="none" stroke="${INK}" stroke-width="1.2"/>
<path d="M46,-40 C28.5,-16 28,17 45.5,41" fill="none" stroke="${INK}" stroke-width="1.2"/>
${stitches}
<g transform="translate(-4,-46) rotate(-14) scale(-1.45,1.45)">
<g transform="translate(1.8,1.3)">
<path d="M-34,6 C-34,-26 -12,-34 4,-34 C22,-34 34,-22 36,6 Z" fill="${RED}"/>
<path d="M30,4 C48,2 62,8 68,15 C56,17 42,14 30,12 Z" fill="${RED_DARK}"/>
<path d="M-34,5 L36,5 L36,10 L-34,10 Z" fill="${RED_DARK}"/>
</g>
<path d="M-31,-2 l7,-8 M-27,2 l9,-10 M-22,4 l9,-11 M-17,5 l7,-8" stroke="#7a0a1c" stroke-width="0.9" stroke-linecap="round"/>
<path d="M-34,6 C-35,-24 -13,-34.5 4,-34 C21,-33.5 34.5,-22 36,6" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M4,-34 C7.5,-20 7,-6 4,6 M-18,-28.5 C-14,-16 -14,-4 -15.5,6 M22,-29 C20.5,-16 21,-4 22.5,6" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/>
<path d="M-34.5,6.2 C-10,5.4 14,5.6 36.4,6.4 M-34,10.2 C-10,9.6 10,9.8 30,10.4" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M30,5 C48,1.6 62,8 68.5,15.2 C56,17.8 42,14.6 30,12" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M-30,10 C-30.5,-5 -15.5,-5 -16,10" fill="${BALL}" stroke="${INK}" stroke-width="1.3"/>
<path d="M-31.5,7.6 C-26,7.2 -20,7.4 -14.5,7.8" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="4" cy="-35" r="3" fill="${RED}" stroke="${INK}" stroke-width="1.2"/>
</g>
<path d="M76,-66 C83,-69 90,-71 99,-71 M82,-46 C90,-47 98,-47 108,-45 M78,-25 C85,-23 91,-21 98,-17" fill="none" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M-82,-30 l4,4 M-90,-12 l6,1" stroke="${RED}" stroke-width="2.4" stroke-linecap="round"/>
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
