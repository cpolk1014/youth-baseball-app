import type { FieldPosition, Lineup, Position } from "./types";

export interface PlayerParticipation {
  /** Innings in the field (not on the bench). */
  field: number;
  bench: number;
  infield: number;
  byPosition: Partial<Record<Position, number>>;
}

export function emptyParticipation(): PlayerParticipation {
  return { field: 0, bench: 0, infield: 0, byPosition: {} };
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
    for (const slot of lineup.slots) {
      if (slot.inning < 1 || slot.inning > lineup.innings) continue;
      const p = (totals[slot.playerId] ??= emptyParticipation());
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
  avgInfield: number;
  avgBench: number;
  /** Player ids more than `threshold` infield innings below the team average. */
  lowInfield: Set<string>;
  /** Player ids more than `threshold` bench innings above the team average. */
  highBench: Set<string>;
}

/** Season-balance outliers among the given players' totals (team average over all of them). */
export function balanceOutliers(
  stats: { id: string; infield: number; bench: number }[],
  threshold: number,
): BalanceOutliers {
  const n = Math.max(stats.length, 1);
  const avgInfield = stats.reduce((sum, s) => sum + s.infield, 0) / n;
  const avgBench = stats.reduce((sum, s) => sum + s.bench, 0) / n;
  return {
    avgInfield,
    avgBench,
    lowInfield: new Set(stats.filter((s) => s.infield < avgInfield - threshold).map((s) => s.id)),
    highBench: new Set(stats.filter((s) => s.bench > avgBench + threshold).map((s) => s.id)),
  };
}
