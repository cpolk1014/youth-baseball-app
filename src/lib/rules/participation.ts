import type { FieldPosition, Lineup, Position } from "./types";

export interface PlayerParticipation {
  /** Games the player has at least one slot in. */
  games: number;
  /** Innings in the field (not on the bench). */
  field: number;
  bench: number;
  infield: number;
  byPosition: Partial<Record<Position, number>>;
}

export function emptyParticipation(): PlayerParticipation {
  return { games: 0, field: 0, bench: 0, infield: 0, byPosition: {} };
}

/**
 * Per-player innings by position across lineups. Participation is always derived from
 * lineup slots like this, never stored.
 */
export function computeParticipation(
  lineups: Lineup[],
  infieldPositions: FieldPosition[],
): Record<string, PlayerParticipation> {
  const infield = new Set<Position>(infieldPositions);
  const totals: Record<string, PlayerParticipation> = {};
  for (const lineup of lineups) {
    const played = new Set<string>();
    for (const slot of lineup.slots) {
      if (slot.inning < 1 || slot.inning > lineup.innings) continue;
      const p = (totals[slot.playerId] ??= emptyParticipation());
      if (!played.has(slot.playerId)) {
        played.add(slot.playerId);
        p.games++;
      }
      p.byPosition[slot.position] = (p.byPosition[slot.position] ?? 0) + 1;
      if (slot.position === "BENCH") {
        p.bench++;
      } else {
        p.field++;
        if (infield.has(slot.position)) p.infield++;
      }
    }
  }
  return totals;
}

export interface BalanceOutliers {
  /** Plain per-player averages, for display. */
  avgInfield: number;
  avgBench: number;
  /** What each player would have at the team's per-game rate, for the games they played. */
  expectedInfield: Map<string, number>;
  expectedBench: Map<string, number>;
  /** Player ids more than `threshold` infield innings below their expected total. */
  lowInfield: Set<string>;
  /** Player ids more than `threshold` bench innings above their expected total. */
  highBench: Set<string>;
}

/**
 * Season-balance outliers. Each player is compared with the team's per-game rate over the
 * games they actually played, so missing games (absent, joined late) doesn't count against
 * them. When everyone played every game this is the same as comparing to the team average.
 */
export function balanceOutliers(
  stats: { id: string; infield: number; bench: number; games: number }[],
  threshold: number,
): BalanceOutliers {
  const sum = (key: "infield" | "bench" | "games") => stats.reduce((t, s) => t + s[key], 0);
  const games = sum("games");
  const infieldRate = games ? sum("infield") / games : 0;
  const benchRate = games ? sum("bench") / games : 0;
  const expectedInfield = new Map(stats.map((s) => [s.id, infieldRate * s.games]));
  const expectedBench = new Map(stats.map((s) => [s.id, benchRate * s.games]));
  const n = Math.max(stats.length, 1);
  return {
    avgInfield: sum("infield") / n,
    avgBench: sum("bench") / n,
    expectedInfield,
    expectedBench,
    lowInfield: new Set(
      stats.filter((s) => expectedInfield.get(s.id)! - s.infield > threshold).map((s) => s.id),
    ),
    highBench: new Set(
      stats.filter((s) => s.bench - expectedBench.get(s.id)! > threshold).map((s) => s.id),
    ),
  };
}
