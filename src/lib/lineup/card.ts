import type { FieldPosition, Lineup, Player } from "@/lib/rules/types";
import { positionAt } from "./edit";

export interface LineupCardRow {
  order: number;
  playerId: string;
  name: string;
  jersey: string;
  /** One label per inning: a position, "BN" for bench, or "" if not set. */
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

  const rows = lineup.battingOrder.map((playerId, i) => {
    const p = byId.get(playerId);
    return {
      order: i + 1,
      playerId,
      name: p?.name ?? "Unknown player",
      jersey: jersey(p),
      positions: innings.map((inning) => {
        const pos = positionAt(lineup, inning, playerId);
        return pos === null ? "" : pos === "BENCH" ? "BN" : pos;
      }),
    };
  });

  const defense = fieldPositions.map((position) => ({
    position,
    players: innings.map((inning) => {
      const slot = lineup.slots.find((s) => s.inning === inning && s.position === position);
      const p = slot ? byId.get(slot.playerId) : undefined;
      if (!p) return "";
      const first = p.name.split(" ")[0] ?? p.name;
      return jersey(p) ? `#${jersey(p)} ${first}` : first;
    }),
  }));

  return {
    innings: lineup.innings,
    rows,
    defense,
    complete: rows.every((r) => r.positions.every((pos) => pos !== "")),
  };
}
