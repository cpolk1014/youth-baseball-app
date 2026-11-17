// Importing a roster from a file (pure): cleaning what Claude read, and matching it against
// the team's roster before the coach adds anyone. Only what a roster needs is kept: a name, a
// jersey number, positions, and whether the kid pitches or catches. Never contact details.
import { namesAgree } from "@/lib/boxscore/names";
import { FIELD_POSITIONS, type FieldPosition, type Player } from "@/lib/rules/types";

/** The JSON shape Claude returns. */
export const ROSTER_JSON_SCHEMA = {
  type: "object",
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The player's name as printed: first and last." },
          number: { type: ["string", "null"], description: "Jersey number, digits only." },
          positions: {
            type: "array",
            items: { type: "string" },
            description:
              "Positions listed for the player (P, C, 1B, 2B, 3B, SS, LF, CF, RF, OF, IF, UTIL).",
          },
          pitcher: { type: ["boolean", "null"] },
          catcher: { type: ["boolean", "null"] },
        },
        required: ["name", "number", "positions", "pitcher", "catcher"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["players", "warnings"],
  additionalProperties: false,
} as const;

export interface RosterExtraction {
  players: {
    name: string;
    number: string | null;
    positions: string[];
    pitcher: boolean | null;
    catcher: boolean | null;
  }[];
  warnings: string[];
}

export interface ReadPlayer {
  name: string;
  jerseyNumber: number | null;
  positions: FieldPosition[];
  canPitch: boolean;
  canCatch: boolean;
}

const MAX_PLAYERS = 40;

/** "Pitcher", "p", "SS/2B", "OF" → field positions (OF is the three outfield spots). */
export function readPositions(labels: string[]): FieldPosition[] {
  const words: Record<string, FieldPosition[]> = {
    PITCHER: ["P"],
    CATCHER: ["C"],
    FIRST: ["1B"],
    "FIRST BASE": ["1B"],
    SECOND: ["2B"],
    "SECOND BASE": ["2B"],
    THIRD: ["3B"],
    "THIRD BASE": ["3B"],
    SHORTSTOP: ["SS"],
    SHORT: ["SS"],
    "LEFT FIELD": ["LF"],
    "CENTER FIELD": ["CF"],
    "RIGHT FIELD": ["RF"],
    OF: ["LF", "CF", "RF"],
    OUTFIELD: ["LF", "CF", "RF"],
    IF: ["1B", "2B", "3B", "SS"],
    INFIELD: ["1B", "2B", "3B", "SS"],
  };
  const out: FieldPosition[] = [];
  for (const label of labels.flatMap((l) => l.split(/[/,;&]| and /i))) {
    const key = label.trim().toUpperCase().replace(/\s+/g, " ");
    if (!key) continue;
    const found = (FIELD_POSITIONS as readonly string[]).includes(key)
      ? [key as FieldPosition]
      : (words[key] ?? []);
    for (const p of found) if (!out.includes(p)) out.push(p);
  }
  // The 10-fielder spots aren't something rosters list.
  return out.filter((p) => p !== "LCF" && p !== "RCF");
}

/** What Claude read, cleaned: real names, numbers 0-99, known positions, no repeats. */
export function cleanRoster(raw: unknown): { players: ReadPlayer[]; warnings: string[] } {
  const r = (raw ?? {}) as Partial<RosterExtraction>;
  const players: ReadPlayer[] = [];
  for (const p of Array.isArray(r.players) ? r.players : []) {
    const name = typeof p?.name === "string" ? p.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!name || !/[a-z]/i.test(name)) continue;
    if (players.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const digits = typeof p.number === "string" ? p.number.replace(/[^0-9]/g, "") : "";
    const n = digits ? Number(digits) : NaN;
    const positions = readPositions(Array.isArray(p.positions) ? p.positions.map(String) : []);
    players.push({
      name,
      jerseyNumber: Number.isInteger(n) && n >= 0 && n <= 99 ? n : null,
      positions,
      canPitch: p.pitcher === true || positions.includes("P"),
      canCatch: p.catcher === true || positions.includes("C"),
    });
    if (players.length >= MAX_PLAYERS) break;
  }
  const warnings = (Array.isArray(r.warnings) ? r.warnings : [])
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .map((w) => w.trim().slice(0, 300))
    .slice(0, 10);
  return { players, warnings };
}

export interface RosterReviewRow {
  read: ReadPlayer;
  /** The roster player with this name, if there is one (adding updates them). */
  existing: Player | null;
  /** Another roster player already wears this number. */
  numberTakenBy: Player | null;
  /** Checked to start with: new players yes, ones already on the roster no. */
  checked: boolean;
}

/** Each player read, matched against the team's roster. */
export function buildRosterReview(read: ReadPlayer[], roster: Player[]): RosterReviewRow[] {
  // Each roster player matches at most one line: exact names first, then names that fit
  // ("Jake P." and "Jake Polk") when only one kid fits.
  const matched = new Map<number, Player>();
  const taken = new Set<string>();
  read.forEach((r, i) => {
    const same = roster.find(
      (p) => !taken.has(p.id) && p.name.toLowerCase() === r.name.toLowerCase(),
    );
    if (same) {
      matched.set(i, same);
      taken.add(same.id);
    }
  });
  read.forEach((r, i) => {
    if (matched.has(i)) return;
    const fits = roster.filter(
      (p) => !taken.has(p.id) && (namesAgree(p.name, r.name) || namesAgree(r.name, p.name)),
    );
    if (fits.length === 1) {
      matched.set(i, fits[0]!);
      taken.add(fits[0]!.id);
    }
  });
  return read.map((r, i) => {
    const existing = matched.get(i) ?? null;
    const numberTakenBy =
      r.jerseyNumber === null
        ? null
        : (roster.find(
            (p) => p.id !== existing?.id && p.active !== false && p.jerseyNumber === r.jerseyNumber,
          ) ?? null);
    return { read: r, existing, numberTakenBy, checked: existing === null };
  });
}

/**
 * The player to save for a checked row: a new player, or the one already on the roster with
 * the file's number, positions and pitch/catch added (nothing they had is taken away).
 */
export function rowToPlayer(row: RosterReviewRow, newId: () => string): Player {
  const r = row.read;
  if (row.existing) {
    const e = row.existing;
    return {
      ...e,
      jerseyNumber: r.jerseyNumber ?? e.jerseyNumber ?? null,
      preferredPositions: [
        ...e.preferredPositions,
        ...r.positions.filter((p) => !e.preferredPositions.includes(p)),
      ],
      canPitch: e.canPitch || r.canPitch,
      canCatch: e.canCatch || r.canCatch,
      active: true,
    };
  }
  return {
    id: newId(),
    name: r.name,
    jerseyNumber: r.jerseyNumber,
    preferredPositions: r.positions,
    canPitch: r.canPitch,
    canCatch: r.canCatch,
    active: true,
  };
}
