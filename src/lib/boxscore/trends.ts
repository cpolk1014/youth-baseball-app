// How a kid's season has gone game by game (pure), for My player's charts.
import { seasonTotals, type KidGame } from "./stats";

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
