// How a kid's season has gone game by game (pure), for My player's charts and player card.
import { seasonTotals, type KidGame, type SeasonTotals } from "./stats";

export interface TrendPoint {
  gameId: string;
  date: string;
  opponent: string;
  /** Season-to-date rates after this game (null until there's an at-bat). */
  avg: number | null;
  obp: number | null;
  ops: number | null;
  /** This game alone. */
  hits: number;
  atBats: number;
}

const byDate = (games: KidGame[]) =>
  [...games].sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id.localeCompare(b.id));

/** Batting, season-to-date after each game, oldest first. */
export function battingTrend(games: KidGame[]): TrendPoint[] {
  const sorted = byDate(games);
  return sorted.map((g, i) => {
    const soFar = seasonTotals(sorted.slice(0, i + 1)).batting;
    return {
      gameId: g.id,
      date: g.gameDate,
      opponent: g.opponent,
      avg: soFar.avg,
      obp: soFar.obp,
      ops: soFar.ops,
      hits: g.batting.h,
      atBats: g.batting.ab,
    };
  });
}

export interface PitchingPoint {
  gameId: string;
  date: string;
  opponent: string;
  pitches: number;
  /** Share of pitches that were strikes, this game (null without a pitch count). */
  strikePct: number | null;
  strikeouts: number;
}

/** Each game they pitched, oldest first. */
export function pitchingTrend(games: KidGame[]): PitchingPoint[] {
  return byDate(games)
    .filter((g) => g.pitching)
    .map((g) => ({
      gameId: g.id,
      date: g.gameDate,
      opponent: g.opponent,
      pitches: g.pitching!.pitches,
      strikePct: g.pitching!.pitches > 0 ? g.pitching!.strikes / g.pitching!.pitches : null,
      strikeouts: g.pitching!.so,
    }));
}

export interface PlayerCardModel {
  name: string;
  jersey: string | null;
  teamName: string;
  season: string;
  games: number;
  /** The four big numbers. */
  rates: { label: string; value: string }[];
  /** Counting stats under them (only the ones that aren't zero, up to six). */
  counts: { label: string; value: string }[];
  /** "2.0 IP · 3.50 ERA · 6 K" when they pitched. */
  pitching: string | null;
}

const rate = (x: number | null) =>
  x === null ? "–" : x < 1 ? x.toFixed(3).replace(/^0/, "") : x.toFixed(3);

/** What the shareable player card shows: the kid's own season, nobody else's. */
export function playerCardModel(input: {
  name: string;
  jersey: number | null;
  teamName: string;
  season: string;
  totals: SeasonTotals;
}): PlayerCardModel {
  const b = input.totals.batting;
  const counts = (
    [
      ["H", b.h],
      ["HR", b.hr],
      ["RBI", b.rbi],
      ["R", b.r],
      ["2B", b.doubles],
      ["3B", b.triples],
      ["BB", b.bb],
      ["SB", b.sb],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .slice(0, 6)
    .map(([label, n]) => ({ label, value: String(n) }));
  const p = input.totals.pitching;
  const ip = p ? `${Math.floor(p.outs / 3)}.${p.outs % 3}` : null;
  return {
    name: input.name,
    jersey: input.jersey === null ? null : `#${input.jersey}`,
    teamName: input.teamName,
    season: input.season,
    games: input.totals.games,
    rates: [
      { label: "AVG", value: rate(b.avg) },
      { label: "OBP", value: rate(b.obp) },
      { label: "SLG", value: rate(b.slg) },
      { label: "OPS", value: rate(b.ops) },
    ],
    counts,
    pitching:
      p && ip
        ? [
            `${ip} IP`,
            p.era === null ? null : `${p.era.toFixed(2)} ERA`,
            `${p.so} K`,
            p.strikePct === null ? null : `${Math.round(p.strikePct * 100)}% strikes`,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
  };
}

/** "leo-t-fall-2026.png" */
export function playerCardFileName(name: string, season: string): string {
  const slug = `${name} ${season}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "player"}.png`;
}
