import type { Lineup, Player, Position } from "@/lib/rules/types";

/** Active players in jersey-number order (the default batting order). */
export function activePlayers(players: Player[]): Player[] {
  return players
    .filter((p) => p.active !== false)
    .sort(
      (a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.name.localeCompare(b.name),
    );
}

export function emptyLineup(players: Player[], innings: number): Lineup {
  return { innings, battingOrder: activePlayers(players).map((p) => p.id), slots: [] };
}

/**
 * Bring a saved lineup in line with the current roster and game length: drop inactive or
 * removed players and out-of-range innings, and add new players to the end of the order.
 */
export function normalizeLineup(lineup: Lineup, players: Player[], innings: number): Lineup {
  const active = activePlayers(players);
  const ids = new Set(active.map((p) => p.id));
  const kept = lineup.battingOrder.filter((id) => ids.has(id));
  const added = active.map((p) => p.id).filter((id) => !kept.includes(id));
  return {
    innings,
    battingOrder: [...kept, ...added],
    slots: lineup.slots.filter((s) => ids.has(s.playerId) && s.inning >= 1 && s.inning <= innings),
  };
}

export function positionAt(lineup: Lineup, inning: number, playerId: string): Position | null {
  return lineup.slots.find((s) => s.inning === inning && s.playerId === playerId)?.position ?? null;
}

/** Who holds each field position in an inning (bench excluded). */
export function holdersByPosition(lineup: Lineup, inning: number): Map<Position, string> {
  const map = new Map<Position, string>();
  for (const s of lineup.slots) {
    if (s.inning === inning && s.position !== "BENCH") map.set(s.position, s.playerId);
  }
  return map;
}

/**
 * Put a player at a position for one inning (null clears it). If someone else already has
 * that field position, they swap: they take the player's old spot (or become unassigned).
 */
export function assignPosition(
  lineup: Lineup,
  inning: number,
  playerId: string,
  position: Position | null,
): Lineup {
  const previous = positionAt(lineup, inning, playerId);
  const holder =
    position && position !== "BENCH" ? holdersByPosition(lineup, inning).get(position) : undefined;
  const slots = lineup.slots.filter(
    (s) => !(s.inning === inning && (s.playerId === playerId || s.playerId === holder)),
  );
  if (position) slots.push({ inning, playerId, position });
  if (holder && holder !== playerId && previous)
    slots.push({ inning, playerId: holder, position: previous });
  return { ...lineup, slots };
}

export function moveBatter(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved!);
  return next;
}
