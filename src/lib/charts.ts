// Numbers behind the charts (pure: no I/O, no React).
import { gameResult, splitGames, type GameResult } from "@/lib/data/game";
import type { Game } from "@/lib/data/types";
import type { FinanceEntry } from "@/lib/finance/types";
import type { SeasonRow } from "@/lib/season/summary";

export interface MoneyPoint {
  date: string;
  /** Running totals up to and including this date. */
  inCents: number;
  outCents: number;
}

/**
 * Money that actually moved, added up day by day: in = family payments (less money given
 * back) and fundraisers; out = Walkoffs. Estimates are left out, like the team totals.
 */
export function moneyTimeline(entries: readonly FinanceEntry[]): MoneyPoint[] {
  const byDate = new Map<string, { in: number; out: number }>();
  for (const e of entries) {
    if (e.estimate) continue;
    let dIn = 0;
    let dOut = 0;
    if (e.type === "safe_at_home") dIn = e.refund ? -e.amountCents : e.amountCents;
    else if (e.type === "grand_slam") dIn = e.amountCents;
    else if (e.type === "walkoff") dOut = e.amountCents;
    else continue;
    const day = byDate.get(e.date) ?? { in: 0, out: 0 };
    byDate.set(e.date, { in: day.in + dIn, out: day.out + dOut });
  }
  let inCents = 0;
  let outCents = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      inCents += d.in;
      outCents += d.out;
      return { date, inCents, outCents };
    });
}

export interface GameRuns {
  id: string;
  date: string;
  opponent: string;
  us: number;
  them: number;
  result: GameResult;
}

/** Final games with both scores, oldest first. */
export function gameRuns(games: Game[]): GameRuns[] {
  return splitGames(games)
    .final.filter((g) => gameResult(g) !== null)
    .reverse()
    .map((g) => ({
      id: g.id,
      date: g.date,
      opponent: g.opponent,
      us: g.scoreUs!,
      them: g.scoreThem!,
      result: gameResult(g)!,
    }));
}

export interface PlayingTimeBar {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  infield: number;
  outfield: number;
  bench: number;
  total: number;
  flagged: boolean;
}

/** Each kid's season innings split into infield, outfield and bench. */
export function playingTimeBars(rows: SeasonRow[]): PlayingTimeBar[] {
  return rows.map((r) => ({
    playerId: r.player.id,
    name: r.player.name,
    jerseyNumber: r.player.jerseyNumber ?? null,
    infield: r.infield,
    outfield: r.field - r.infield,
    bench: r.bench,
    total: r.field + r.bench,
    flagged: r.lowInfield || r.highBench,
  }));
}
