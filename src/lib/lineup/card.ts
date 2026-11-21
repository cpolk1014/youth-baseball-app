import type { FieldPosition, Lineup, Player } from "@/lib/rules/types";
import { inningParts, lineupRows } from "./edit";

export interface LineupCardRow {
  /** Batting slot, or null for a player sitting out of the batting order. */
  order: number | null;
  playerId: string;
  name: string;
  jersey: string;
  /**
   * One label per inning: a position, "BN" for bench, "" if not set, or each spot in order
   * when the inning was changed in the middle ("CF→P").
   */
  positions: string[];
}

export interface LineupCardData {
  innings: number;
  rows: LineupCardRow[];
  /** Who plays each position, per inning ("#12 Theo", or "" if open). */
  defense: { position: FieldPosition; players: string[] }[];
  /** Every player has a spot in every inning. */
  complete: boolean;
}

/** Everything a printed lineup card shows, in batting order. Pure. */
export function buildLineupCard(
  players: Player[],
  lineup: Lineup,
  fieldPositions: FieldPosition[],
): LineupCardData {
  const byId = new Map(players.map((p) => [p.id, p]));
  const innings = Array.from({ length: lineup.innings }, (_, i) => i + 1);
  const jersey = (p: Player | undefined) => (p?.jerseyNumber != null ? String(p.jerseyNumber) : "");

  const rows = lineupRows(lineup).map(({ playerId, order }) => {
    const p = byId.get(playerId);
    return {
      order,
      playerId,
      name: p?.name ?? "Unknown player",
      jersey: jersey(p),
      positions: innings.map((inning) =>
        inningParts(lineup, inning, playerId)
          .map((s) => (s.position === "BENCH" ? "BN" : s.position))
          .join("→"),
      ),
    };
  });

  const defense = fieldPositions.map((position) => ({
    position,
    // Everyone who played the spot that inning, in order ("#7 Mason→#12 Jake").
    players: innings.map((inning) =>
      lineup.slots
        .filter((s) => s.inning === inning && s.position === position)
        .sort((a, b) => (a.fromOut ?? 0) - (b.fromOut ?? 0))
        .map((s) => byId.get(s.playerId))
        .filter((p): p is Player => !!p)
        .map((p) => {
          const first = p.name.split(" ")[0] ?? p.name;
          return jersey(p) ? `#${jersey(p)} ${first}` : first;
        })
        .join("→"),
    ),
  }));

  return {
    innings: lineup.innings,
    rows,
    defense,
    complete: rows.every((r) => r.positions.every((pos) => pos !== "")),
  };
}
