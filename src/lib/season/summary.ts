import { activePlayers } from "@/lib/lineup/edit";
import {
  balanceOutliers,
  computeParticipation,
  emptyParticipation,
} from "@/lib/rules/participation";
import {
  FIELD_POSITIONS,
  type Lineup,
  type Player,
  type Position,
  type RuleConfig,
} from "@/lib/rules/types";

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
  /** Grid columns: field positions used in final games (or the defaults), then the bench. */
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
  const active = activePlayers(players);
  const stats = active.map((p) => ({ id: p.id, ...(totals[p.id] ?? emptyParticipation()) }));
  const threshold = config.seasonBalanceThreshold;
  const outliers = balanceOutliers(stats, threshold ?? Infinity);

  const row = (p: Player): SeasonRow => {
    const t = totals[p.id] ?? emptyParticipation();
    return {
      player: p,
      games: t.games,
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
    positions: [...seasonPositions(finalLineups, config), "BENCH"],
  };
}

/** Positions used in final games, in standard order; mixes 9- and 10-fielder games. */
function seasonPositions(finalLineups: Lineup[], config: RuleConfig): Position[] {
  const used = new Set(finalLineups.flatMap((l) => l.slots.map((s) => s.position)));
  const positions = FIELD_POSITIONS.filter((p) => used.has(p));
  return positions.length > 0 ? positions : config.fieldPositions;
}
