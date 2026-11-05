// A kid's own game lines (from box scores their parent imported) and their season totals.

export const BATTING_KEYS = [
  "ab",
  "r",
  "h",
  "rbi",
  "bb",
  "so",
  "doubles",
  "triples",
  "hr",
  "sb",
  "cs",
  "hbp",
  "sac",
  "sf",
] as const;
export type BattingKey = (typeof BATTING_KEYS)[number];
export type GameBatting = Record<BattingKey, number>;

export const PITCHING_KEYS = [
  "outs",
  "h",
  "r",
  "er",
  "bb",
  "so",
  "pitches",
  "strikes",
  "bf",
] as const;
export type PitchingKey = (typeof PITCHING_KEYS)[number];
export type GamePitching = Record<PitchingKey, number>;

export interface KidGame {
  id: string;
  playerId: string;
  /** The team game it's from (null for box scores imported before games were matched). */
  gameId?: string | null;
  gameDate: string;
  opponent: string;
  ourRuns: number | null;
  theirRuns: number | null;
  teamName: string | null;
  boxName: string | null;
  batting: GameBatting;
  pitching: GamePitching | null;
  errors: number;
  positions: string[];
}

/** Innings for youth ERA: most youth games are 6. */
export const ERA_INNINGS = 6;

const count = (v: unknown, max = 99) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0;
};

/** "3.2" innings pitched (3⅔) → 11 outs. */
export function inningsToOuts(ip: unknown): number {
  const m = /^(\d{1,2})(?:\.([012]))?$/.exec(String(ip ?? "").trim());
  return m ? Number(m[1]) * 3 + Number(m[2] ?? 0) : 0;
}

/** 11 outs → "3.2" (box-score style). */
export function outsToInnings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function cleanBatting(raw: unknown): GameBatting {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(BATTING_KEYS.map((k) => [k, count(r[k])])) as GameBatting;
}

/** Pitching from the reader ({ip: "3.2", h, ...}); null when they didn't pitch. */
export function cleanPitching(raw: unknown): GamePitching | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const outs = r.outs !== undefined ? count(r.outs, 63) : inningsToOuts(r.ip);
  const line = Object.fromEntries(
    PITCHING_KEYS.map((k) => [
      k,
      k === "outs" ? outs : count(r[k], k.startsWith("p") || k === "strikes" ? 300 : 99),
    ]),
  ) as GamePitching;
  return line.outs === 0 && line.bf === 0 && line.pitches === 0 ? null : line;
}

export interface SeasonTotals {
  games: number;
  wins: number;
  losses: number;
  batting: GameBatting & {
    pa: number;
    singles: number;
    tb: number;
    avg: number | null;
    obp: number | null;
    slg: number | null;
    ops: number | null;
  };
  pitching:
    | (GamePitching & {
        games: number;
        era: number | null;
        whip: number | null;
        strikePct: number | null;
      })
    | null;
  errors: number;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Season totals and rates from a kid's game lines. */
export function seasonTotals(games: KidGame[]): SeasonTotals {
  const b = Object.fromEntries(BATTING_KEYS.map((k) => [k, 0])) as GameBatting;
  for (const g of games) for (const k of BATTING_KEYS) b[k] += g.batting[k];
  const singles = Math.max(0, b.h - b.doubles - b.triples - b.hr);
  const tb = singles + 2 * b.doubles + 3 * b.triples + 4 * b.hr;
  const pa = b.ab + b.bb + b.hbp + b.sac + b.sf;
  const avg = div(b.h, b.ab);
  const obp = div(b.h + b.bb + b.hbp, b.ab + b.bb + b.hbp + b.sf);
  const slg = div(tb, b.ab);

  const pitched = games.filter((g) => g.pitching);
  let pitching: SeasonTotals["pitching"] = null;
  if (pitched.length) {
    const p = Object.fromEntries(PITCHING_KEYS.map((k) => [k, 0])) as GamePitching;
    for (const g of pitched) for (const k of PITCHING_KEYS) p[k] += g.pitching![k];
    const ip = p.outs / 3;
    pitching = {
      ...p,
      games: pitched.length,
      era: div(p.er * ERA_INNINGS, ip),
      whip: div(p.bb + p.h, ip),
      strikePct: div(p.strikes, p.pitches),
    };
  }

  const decided = games.filter((g) => g.ourRuns !== null && g.theirRuns !== null);
  return {
    games: games.length,
    wins: decided.filter((g) => g.ourRuns! > g.theirRuns!).length,
    losses: decided.filter((g) => g.ourRuns! < g.theirRuns!).length,
    batting: {
      ...b,
      pa,
      singles,
      tb,
      avg,
      obp,
      slg,
      ops: obp !== null && slg !== null ? obp + slg : null,
    },
    pitching,
    errors: games.reduce((s, g) => s + g.errors, 0),
  };
}

/** .333 (under 1) or 1.250. */
export function rate(x: number | null): string {
  if (x === null) return "–";
  return x < 1 ? x.toFixed(3).replace(/^0/, "") : x.toFixed(3);
}

/** A short game line: "1-3, 2B, 2 RBI, BB" (and "2.0 IP, 3 K" when they pitched). */
export function gameLine(g: KidGame): string {
  const b = g.batting;
  const parts = [`${b.h}-${b.ab}`];
  const add = (n: number, label: string) => n && parts.push(n > 1 ? `${n} ${label}` : label);
  add(b.doubles, "2B");
  add(b.triples, "3B");
  add(b.hr, "HR");
  add(b.rbi, "RBI");
  add(b.r, "R");
  add(b.bb, "BB");
  add(b.hbp, "HBP");
  add(b.sb, "SB");
  add(b.so, "K");
  if (g.pitching)
    parts.push(`${outsToInnings(g.pitching.outs)} IP, ${g.pitching.so} K, ${g.pitching.er} ER`);
  return parts.join(", ");
}

const teamKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether two box scores are the same game: the same day and the same opponent, allowing for
 * GameChanger naming it a little differently ("Lakeside Lightning 10U" vs "Lakeside
 * Lightning"). Two games on one day against different teams (a doubleheader) stay separate.
 */
export function sameGame(
  a: Pick<KidGame, "gameDate" | "opponent">,
  b: Pick<KidGame, "gameDate" | "opponent">,
): boolean {
  if (a.gameDate !== b.gameDate) return false;
  const x = teamKey(a.opponent);
  const y = teamKey(b.opponent);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}
