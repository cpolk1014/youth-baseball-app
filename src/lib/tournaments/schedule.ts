// Tournaments, phase 2: the pool schedule and bracket read from screenshots, matched against
// what's already saved so an updated schedule shows only what changed (pure: no I/O).
import type { Game } from "@/lib/data/types";
import { teamKey } from "./event";

export const SCHEDULE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["games", "warnings"],
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "game_no",
          "stage",
          "pool",
          "round",
          "date",
          "start_time",
          "venue",
          "field",
          "home",
          "away",
        ],
        properties: {
          game_no: { type: ["string", "null"], description: "Game number as shown, e.g. 7." },
          stage: { type: "string", enum: ["pool", "bracket"] },
          pool: { type: ["string", "null"], description: "Pool name, e.g. A (pool games)." },
          round: {
            type: ["string", "null"],
            description: "Bracket round, e.g. Quarterfinal, Semifinal, Championship.",
          },
          date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          start_time: { type: ["string", "null"], description: "24-hour HH:MM" },
          venue: { type: ["string", "null"], description: "The park or complex." },
          field: { type: ["string", "null"], description: "The field within it, e.g. Field 2." },
          home: {
            type: "string",
            description:
              "Team name as shown, or the bracket placeholder (e.g. 1st Pool A, Winner G7).",
          },
          away: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export interface ScheduleGame {
  gameNo: string | null;
  stage: "pool" | "bracket";
  pool: string | null;
  round: string | null;
  date: string | null;
  startTime: string | null;
  venue: string | null;
  field: string | null;
  home: string;
  away: string;
}

export interface Schedule {
  games: ScheduleGame[];
  warnings: string[];
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;

/** What came back from Claude, checked and tidied; games without both sides are dropped. */
export function cleanSchedule(raw: unknown): Schedule {
  const r = (raw ?? {}) as { games?: unknown; warnings?: unknown };
  const games: ScheduleGame[] = [];
  for (const g of Array.isArray(r.games) ? r.games : []) {
    const x = (g ?? {}) as Record<string, unknown>;
    const home = str(x.home, 120);
    const away = str(x.away, 120);
    if (!home || !away) continue;
    const date = typeof x.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null;
    const time =
      typeof x.start_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.start_time)
        ? x.start_time
        : null;
    games.push({
      gameNo: str(x.game_no, 20)?.replace(/^(game|g)\s*#?\s*/i, "") || null,
      stage: x.stage === "bracket" ? "bracket" : "pool",
      pool: str(x.pool, 40)?.replace(/^pool\s+/i, "") || null,
      round: str(x.round, 40),
      date,
      startTime: time,
      venue: str(x.venue, 80),
      field: str(x.field, 80),
      home,
      away,
    });
  }
  // Keep one game per game number (a game often shows in both the pool list and a team view).
  const seen = new Set<string>();
  const unique = games.filter((g) => {
    const k = gameKey(g);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const warnings = Array.isArray(r.warnings)
    ? r.warnings.flatMap((w) => str(w, 300) ?? []).slice(0, 10)
    : [];
  return { games: unique.slice(0, 200), warnings };
}

/** How a game is recognized across schedule updates: its number, else when, where and who. */
export function gameKey(
  g: Pick<ScheduleGame, "gameNo" | "date" | "startTime" | "field" | "home" | "away">,
): string {
  if (g.gameNo) return `#${teamKey(g.gameNo)}`;
  const sides = [teamKey(g.home), teamKey(g.away)].sort().join("|");
  return `${g.date ?? ""} ${g.startTime ?? ""} ${teamKey(g.field ?? "")} ${sides}`;
}

export interface SavedGame extends ScheduleGame {
  id: string;
  gameId: string | null;
}

export interface ScheduleChange {
  saved: SavedGame;
  next: ScheduleGame;
  changes: string[];
}

export interface ScheduleMatch {
  added: ScheduleGame[];
  changed: ScheduleChange[];
  unchanged: SavedGame[];
  /** Saved games not in the new screenshots (kept; a screenshot may show only part). */
  notShown: SavedGame[];
}

export const time12 = (t: string | null) => {
  if (!t) return "no time";
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const day = (d: string | null) =>
  d
    ? new Date(`${d}T12:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "no date";
export const placeOf = (g: Pick<ScheduleGame, "venue" | "field">) =>
  [g.venue, g.field].filter(Boolean).join(" · ");

/** What changed between the saved game and the new screenshot, in words. */
export function describeChanges(a: ScheduleGame, b: ScheduleGame): string[] {
  const out: string[] = [];
  if (a.date !== b.date && b.date) out.push(`moved to ${day(b.date)}`);
  if (a.startTime !== b.startTime && b.startTime) out.push(`now ${time12(b.startTime)}`);
  if (teamKey(placeOf(a)) !== teamKey(placeOf(b)) && placeOf(b)) out.push(`now at ${placeOf(b)}`);
  const sides = (g: ScheduleGame) => [teamKey(g.home), teamKey(g.away)].sort().join("|");
  if (sides(a) !== sides(b)) out.push(`now ${b.home} vs ${b.away}`);
  if ((a.pool ?? "") !== (b.pool ?? "") && b.pool) out.push(`Pool ${b.pool}`);
  if ((a.round ?? "") !== (b.round ?? "") && b.round) out.push(b.round);
  return out;
}

/** Match newly read games against the saved schedule. */
export function matchSchedule(saved: SavedGame[], found: ScheduleGame[]): ScheduleMatch {
  const byKey = new Map(saved.map((s) => [gameKey(s), s]));
  const used = new Set<string>();
  const added: ScheduleGame[] = [];
  const changed: ScheduleChange[] = [];
  const unchanged: SavedGame[] = [];
  for (const g of found) {
    const s = byKey.get(gameKey(g));
    if (!s || used.has(s.id)) {
      added.push(g);
      continue;
    }
    used.add(s.id);
    const changes = describeChanges(s, g);
    if (changes.length) changed.push({ saved: s, next: g, changes });
    else unchanged.push(s);
  }
  return { added, changed, unchanged, notShown: saved.filter((s) => !used.has(s.id)) };
}

/** Whether we play in this game, and against whom. */
export function ourSide(
  g: Pick<ScheduleGame, "home" | "away">,
  ourName: string | null,
): { opponent: string } | null {
  if (!ourName) return null;
  const us = teamKey(ourName);
  if (teamKey(g.home) === us) return { opponent: g.away };
  if (teamKey(g.away) === us) return { opponent: g.home };
  return null;
}

/** The tournament team a side refers to (null for placeholders like "1st Pool A"). */
export function teamIdFor(name: string, teams: { id: string; name: string }[]): string | null {
  const k = teamKey(name);
  return teams.find((t) => teamKey(t.name) === k)?.id ?? null;
}

/** Games grouped by day, in time order (no date last). */
export function byDay<T extends Pick<ScheduleGame, "date" | "startTime" | "gameNo">>(
  games: T[],
): { date: string | null; games: T[] }[] {
  const sorted = [...games].sort(
    (a, b) =>
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      (a.startTime ?? "99").localeCompare(b.startTime ?? "99") ||
      (Number(a.gameNo) || 0) - (Number(b.gameNo) || 0),
  );
  const out: { date: string | null; games: T[] }[] = [];
  for (const g of sorted) {
    const last = out.at(-1);
    if (last && last.date === g.date) last.games.push(g);
    else out.push({ date: g.date, games: [g] });
  }
  return out;
}

/**
 * The team game for one of our tournament games: a new one, or the linked one updated with
 * the schedule's date, time, opponent and place (its lineup, uniform and the rest are kept).
 * Null when the schedule has no date for it yet.
 */
export function teamGameFor(
  g: ScheduleGame,
  opponent: string,
  opts: {
    existing: Game | null;
    id: string;
    seasonId: string;
    fieldPlayers: 9 | 10;
    venues: string[];
  },
): Game | null {
  if (!g.date) return null;
  const location = g.venue ?? (opts.venues.length === 1 ? opts.venues[0]! : null);
  const e = opts.existing;
  if (e) {
    const moved = teamKey(e.location ?? "") !== teamKey(location ?? "");
    return {
      ...e,
      date: g.date,
      startTime: g.startTime ?? e.startTime,
      opponent,
      field: g.field ?? e.field ?? null,
      // A new park drops the old map pin; the same park keeps it.
      ...(moved && location
        ? {
            location,
            locationAddress: null,
            locationLat: null,
            locationLng: null,
            locationPlaceId: null,
          }
        : {}),
    };
  }
  return {
    id: opts.id,
    seasonId: opts.seasonId,
    date: g.date,
    startTime: g.startTime,
    opponent,
    location,
    field: g.field,
    innings: 6,
    fieldPlayers: opts.fieldPlayers,
    status: "scheduled",
  };
}

/** A team game already on the schedule for this tournament game (same day and opponent). */
export function findTeamGame(
  g: Pick<ScheduleGame, "date">,
  opponent: string,
  games: Game[],
  taken: Set<string>,
): Game | null {
  return (
    games.find(
      (x) => !taken.has(x.id) && x.date === g.date && teamKey(x.opponent) === teamKey(opponent),
    ) ?? null
  );
}
