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
