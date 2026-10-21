import { activePlayers } from "@/lib/lineup/edit";
import {
  balanceOutliers,
  computeParticipation,
  emptyParticipation,
} from "@/lib/rules/participation";
import type { Lineup, Player, Position, RuleConfig } from "@/lib/rules/types";

export interface SeasonRow {
  player: Player;
  /** Final games the player appears in. */
  games: number;
  field: number;
  infield: number;
  bench: number;
  byPosition: Partial<Record<Position, number>>;
  lowInfield: boolean;
  highBench: boolean;
}

export interface SeasonSummary {
  finalGames: number;
  /** Active players, jersey order. */
  rows: SeasonRow[];
  /** Inactive players who have innings this season. */
  inactiveRows: SeasonRow[];
  avgInfield: number;
  avgBench: number;
  /** Grid columns: the season's field positions, then the bench. */
  positions: Position[];
}

/**
 * Season playing time per player from final games' lineups. Flags use the same
 * season-balance rule as the lineup warnings (active players only).
 */
export function seasonSummary(
  players: Player[],
  finalLineups: Lineup[],
  config: RuleConfig,
): SeasonSummary {
  const totals = computeParticipation(finalLineups, config.infieldPositions);
  const gamesPlayed = new Map<string, number>();
  for (const lineup of finalLineups) {
    const ids = new Set(
      lineup.slots
        .filter((s) => s.inning >= 1 && s.inning <= lineup.innings)
        .map((s) => s.playerId),
    );
    for (const id of ids) gamesPlayed.set(id, (gamesPlayed.get(id) ?? 0) + 1);
  }

  const active = activePlayers(players);
  const stats = active.map((p) => ({ id: p.id, ...(totals[p.id] ?? emptyParticipation()) }));
  const threshold = config.seasonBalanceThreshold;
  const outliers = balanceOutliers(stats, threshold ?? Infinity);

  const row = (p: Player): SeasonRow => {
    const t = totals[p.id] ?? emptyParticipation();
    return {
      player: p,
      games: gamesPlayed.get(p.id) ?? 0,
      field: t.field,
      infield: t.infield,
      bench: t.bench,
      byPosition: t.byPosition,
      lowInfield: threshold !== null && outliers.lowInfield.has(p.id),
      highBench: threshold !== null && outliers.highBench.has(p.id),
    };
  };

  const inactive = players
    .filter((p) => p.active === false && totals[p.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    finalGames: finalLineups.length,
    rows: active.map(row),
    inactiveRows: inactive.map(row),
    avgInfield: outliers.avgInfield,
    avgBench: outliers.avgBench,
    positions: [...config.fieldPositions, "BENCH"],
  };
}
