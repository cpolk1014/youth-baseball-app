// Team colors: pulling a palette out of a picture, and keeping text readable on a
// phone in the sun. Pure.

export const DEFAULT_PRIMARY = "#0b1f3a";
export const DEFAULT_ACCENT = "#c8352e";

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export const isHex = (s: unknown): s is string => typeof s === "string" && hexToRgb(s) !== null;

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever reads better on this color. */
export function inkFor(hex: string): "#ffffff" | "#000000" {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  return contrast(rgb, [255, 255, 255]) >= contrast(rgb, [0, 0, 0]) ? "#ffffff" : "#000000";
}

/**
 * The color darkened just enough that white text on it (and it on white) passes 4.5:1, the
 * usual bar for reading text. Used for the app's bars and buttons, so a pale team color
 * like gold still reads outdoors. Dark colors come back unchanged.
 */
export function readableOnWhite(hex: string, min = 4.5): string {
  let rgb = hexToRgb(hex) ?? (hexToRgb(DEFAULT_PRIMARY) as RGB);
  for (let i = 0; i < 40 && contrast(rgb, [255, 255, 255]) < min; i++) {
    rgb = rgb.map((v) => v * 0.92) as RGB;
  }
  return rgbToHex(rgb);
}

/** A slightly darker shade, for pressed buttons. */
export function pressed(hex: string): string {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  return rgbToHex(rgb.map((v) => v * 0.8) as RGB);
}

/** Perceptual-ish distance between two colors (0 to ~765). */
export function distance(a: RGB, b: RGB): number {
  // Weighted Euclidean ("redmean") approximation.
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function saturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The main colors in a picture (RGBA pixels, as from a canvas), most prominent first:
 * transparent pixels are skipped, similar shades are grouped, and colorful shades rank
 * ahead of the white/gray background most logos and photos have. Black and white still
 * count when the picture is mostly those.
 */
export function extractPalette(pixels: Uint8ClampedArray | number[], count = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a < 128) continue;
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    // 4 bits per channel: 4,096 buckets.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const total = [...buckets.values()].reduce((s, x) => s + x.n, 0);
  if (total === 0) return [];
  const colors = [...buckets.values()].map((x) => {
    const rgb: RGB = [x.r / x.n, x.g / x.n, x.b / x.n];
    // Grays, near-white and near-black usually are background or outlines: rank them lower.
    const plain = isPlain(rgbToHex(rgb));
    return { rgb, share: x.n / total, score: (x.n / total) * (plain ? 0.15 : 1) };
  });
  colors.sort((a, b) => b.score - a.score);

  const picked: RGB[] = [];
  for (const c of colors) {
    if (c.share < 0.005) break;
    if (picked.every((p) => distance(p, c.rgb) > 90)) picked.push(c.rgb);
    if (picked.length >= count) break;
  }
  return picked.map(rgbToHex);
}

/** White, black and grays: usually background or outline, not a team color. */
export function isPlain(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const lum = luminance(rgb);
  return saturation(rgb) < 0.2 || lum > 0.9 || lum < 0.01;
}

/**
 * Main and accent picked from a picture's palette: the first two real colors, falling back
 * to white or black only when the picture doesn't have two.
 */
export function suggestPair(palette: string[]): { main: string; accent: string } | null {
  if (palette.length === 0) return null;
  const colorful = palette.filter((h) => !isPlain(h));
  const ordered = [...colorful, ...palette.filter((h) => isPlain(h))];
  return { main: ordered[0]!, accent: ordered[1] ?? ordered[0]! };
}

/** Common team colors to pick from. */
export const TEAM_SWATCHES: { name: string; hex: string }[] = [
  { name: "Navy", hex: "#0b1f3a" },
  { name: "Royal", hex: "#1d4ed8" },
  { name: "Columbia blue", hex: "#5b9bd5" },
  { name: "Red", hex: "#c8102e" },
  { name: "Maroon", hex: "#7a1e2c" },
  { name: "Orange", hex: "#e8590c" },
  { name: "Gold", hex: "#f2b705" },
  { name: "Kelly green", hex: "#15803d" },
  { name: "Forest", hex: "#14532d" },
  { name: "Purple", hex: "#5b21b6" },
  { name: "Black", hex: "#111111" },
  { name: "Gray", hex: "#6b7280" },
];
