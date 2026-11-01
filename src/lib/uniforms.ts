// Uniform combos: a name and five pieces (shirt, pants, hat, belt, socks), each a short
// color description like "Black" or "White, red sleeves". A game wears a saved combo or
// pieces chosen just for it.

export const UNIFORM_PIECES = [
  { key: "shirt", label: "Shirt" },
  { key: "pants", label: "Pants" },
  { key: "hat", label: "Hat" },
  { key: "belt", label: "Belt" },
  { key: "socks", label: "Socks" },
] as const;

export type UniformPiece = (typeof UNIFORM_PIECES)[number]["key"];
export type UniformPieces = Record<UniformPiece, string | null>;

export interface UniformCombo extends UniformPieces {
  id: string;
  name: string;
}

/** What a game wears: one of the team's combos, its own pieces, or nothing set. */
export type GameUniform = { comboId: string } | { custom: UniformPieces } | null;

export const MAX_UNIFORM_NAME = 40;
export const MAX_PIECE = 40;

/** Common uniform colors, for quick picks and swatches. */
export const UNIFORM_COLORS: { name: string; hex: string }[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#111111" },
  { name: "Gray", hex: "#9ca3af" },
  { name: "Red", hex: "#c8102e" },
  { name: "Navy", hex: "#1f2a44" },
  { name: "Royal", hex: "#1d4ed8" },
  { name: "Columbia blue", hex: "#9bcbeb" },
  { name: "Green", hex: "#166534" },
  { name: "Gold", hex: "#f2b705" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Maroon", hex: "#7f1d1d" },
  { name: "Purple", hex: "#6b21a8" },
];

const ALIASES: Record<string, string> = {
  grey: "Gray",
  "light blue": "Columbia blue",
  "sky blue": "Columbia blue",
  "royal blue": "Royal",
  blue: "Royal",
  "navy blue": "Navy",
  scarlet: "Red",
  crimson: "Red",
  silver: "Gray",
  yellow: "Gold",
};

/** The swatch color for a piece: the first color named in it ("White, red sleeves" → white). */
export function colorHex(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  let best: { at: number; hex: string } | null = null;
  const consider = (word: string, name: string) => {
    const at = t.search(new RegExp(`\\b${word}\\b`));
    const hex = UNIFORM_COLORS.find((c) => c.name === name)?.hex;
    // Earliest mention wins; a longer name at the same spot ("navy blue") beats "blue".
    if (at >= 0 && hex && (!best || at < best.at)) best = { at, hex };
  };
  for (const c of UNIFORM_COLORS) consider(c.name.toLowerCase(), c.name);
  for (const [word, name] of Object.entries(ALIASES)) consider(word, name);
  return (best as { at: number; hex: string } | null)?.hex ?? null;
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null;

/** Trimmed pieces; blanks become null. */
export function cleanPieces(input: Partial<Record<UniformPiece, unknown>>): UniformPieces {
  return Object.fromEntries(
    UNIFORM_PIECES.map(({ key }) => [key, clean(input[key], MAX_PIECE)]),
  ) as UniformPieces;
}

export function cleanName(name: unknown): string {
  return clean(name, MAX_UNIFORM_NAME) ?? "";
}

/** Why a combo can't be saved, or null. */
export function uniformProblem(name: string | null, pieces: UniformPieces): string | null {
  if (name !== null && !cleanName(name)) return "Give the combo a name.";
  if (UNIFORM_PIECES.every(({ key }) => !pieces[key])) return "Fill in at least one piece.";
  return null;
}

/** "Black shirt · Black pants · Red hat · Red belt · Red socks" (pieces left blank skipped). */
export function describeUniform(pieces: UniformPieces): string {
  return UNIFORM_PIECES.flatMap(({ key, label }) =>
    pieces[key] ? [`${pieces[key]} ${label.toLowerCase()}`] : [],
  ).join(" · ");
}

/** What a game wears, ready to show; null when nothing is set (or its combo is gone). */
export function gameUniformShown(
  uniform: GameUniform | undefined,
  combos: UniformCombo[],
): { name: string | null; pieces: UniformPieces } | null {
  if (!uniform) return null;
  if ("custom" in uniform) return { name: null, pieces: uniform.custom };
  const combo = combos.find((c) => c.id === uniform.comboId);
  return combo ? { name: combo.name, pieces: combo } : null;
}

export interface FlyerCombo extends UniformPieces {
  name: string;
}

/** Combos read from a flyer, cleaned up: named, at least one piece, at most 12. */
export function cleanFlyerCombos(raw: unknown): FlyerCombo[] {
  const list = (raw as { combos?: unknown })?.combos;
  if (!Array.isArray(list)) return [];
  return list
    .map((c: Record<string, unknown>, i) => ({
      name: cleanName(c?.name) || `Combo ${i + 1}`,
      ...cleanPieces(c ?? {}),
    }))
    .filter((c) => UNIFORM_PIECES.some(({ key }) => c[key]))
    .slice(0, 12);
}
