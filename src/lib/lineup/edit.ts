import { outsOf, splitInnings } from "@/lib/rules/outs";
import type { Lineup, LineupSlot, Player, Position } from "@/lib/rules/types";

/** Active players in jersey-number order (the default batting order). */
export function activePlayers(players: Player[]): Player[] {
  return players
    .filter((p) => p.active !== false)
    .sort(
      (a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.name.localeCompare(b.name),
    );
}

export function emptyLineup(players: Player[], innings: number): Lineup {
  return {
    innings,
    battingOrder: activePlayers(players).map((p) => p.id),
    notBatting: [],
    absent: [],
    slots: [],
  };
}

/**
 * Bring a saved lineup in line with the current roster and game length: drop inactive or
 * removed players and out-of-range innings, and add new players to the end of the order.
 */
export function normalizeLineup(lineup: Lineup, players: Player[], innings: number): Lineup {
  const absent = (lineup.absent ?? []).filter((id) =>
    players.some((p) => p.id === id && p.active !== false),
  );
  const away = new Set(absent);
  const active = activePlayers(players).filter((p) => !away.has(p.id));
  const ids = new Set(active.map((p) => p.id));
  const notBatting = (lineup.notBatting ?? []).filter((id) => ids.has(id));
  const sittingOut = new Set(notBatting);
  const kept = lineup.battingOrder.filter((id) => ids.has(id) && !sittingOut.has(id));
  const added = active.map((p) => p.id).filter((id) => !kept.includes(id) && !sittingOut.has(id));
  return {
    innings,
    battingOrder: [...kept, ...added],
    notBatting,
    absent,
    slots: lineup.slots.filter((s) => ids.has(s.playerId) && s.inning >= 1 && s.inning <= innings),
  };
}

/** A player's spot at the start of an inning (the whole inning unless it was split). */
export function positionAt(lineup: Lineup, inning: number, playerId: string): Position | null {
  return positionAtOut(lineup, inning, playerId, 0);
}

/** A player's spot at a moment of an inning, by outs (0 = the start). */
export function positionAtOut(
  lineup: Lineup,
  inning: number,
  playerId: string,
  out: number,
): Position | null {
  for (const s of lineup.slots) {
    if (s.inning !== inning || s.playerId !== playerId) continue;
    const { from, to } = outsOf(s);
    if (from <= out && out < to) return s.position;
  }
  return null;
}

/** A player's parts of an inning, in order (one for a whole inning). */
export function inningParts(lineup: Lineup, inning: number, playerId: string): LineupSlot[] {
  return lineup.slots
    .filter((s) => s.inning === inning && s.playerId === playerId)
    .sort((a, b) => outsOf(a).from - outsOf(b).from);
}

/** Whether an inning has a mid-inning change. */
export function isSplitInning(lineup: Lineup, inning: number): boolean {
  return splitInnings(lineup.slots).has(inning);
}

/** Join a player's touching parts at the same spot; a whole inning carries no outs. */
function tidy(slots: LineupSlot[]): LineupSlot[] {
  const groups = new Map<string, LineupSlot[]>();
  for (const s of slots) {
    const key = `${s.inning}:${s.playerId}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: LineupSlot[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => outsOf(a).from - outsOf(b).from);
    const merged: LineupSlot[] = [];
    for (const s of sorted) {
      const last = merged[merged.length - 1];
      if (last && last.position === s.position && outsOf(last).to === outsOf(s).from) {
        merged[merged.length - 1] = {
          ...last,
          toOut: outsOf(s).to,
          estimated: last.estimated || s.estimated || undefined,
        };
      } else merged.push(s);
    }
    for (const s of merged) {
      const { from, to } = outsOf(s);
      if (from === 0 && to === 3) {
        out.push({ inning: s.inning, playerId: s.playerId, position: s.position });
      } else {
        out.push({
          inning: s.inning,
          playerId: s.playerId,
          position: s.position,
          fromOut: from,
          toOut: to,
          ...(s.estimated ? { estimated: true } : {}),
        });
      }
    }
  }
  return out;
}

export interface Move {
  playerId: string;
  to: Position;
}

/**
 * A change in the middle of an inning: after `atOut` outs (1.5 when the coach wasn't sure,
 * marked `estimated`), each moved player is at their new spot for the rest of the inning.
 * Everyone else stays where they were.
 */
export function changeMidInning(
  lineup: Lineup,
  inning: number,
  atOut: number,
  moves: Move[],
  estimated = false,
): Lineup {
  const moved = new Map(moves.map((m) => [m.playerId, m.to]));
  const slots: LineupSlot[] = [];
  for (const s of lineup.slots) {
    if (s.inning !== inning || !moved.has(s.playerId)) {
      slots.push(s);
      continue;
    }
    const { from, to } = outsOf(s);
    if (from >= atOut) continue; // replaced by the new spot
    slots.push({ ...s, fromOut: from, toOut: Math.min(to, atOut) });
  }
  for (const [playerId, to] of moved) {
    slots.push({
      inning,
      playerId,
      position: to,
      fromOut: atOut,
      toOut: 3,
      ...(estimated ? { estimated: true } : {}),
    });
  }
  return { ...lineup, slots: tidy(slots) };
}

/**
 * The moves for a pitching change: the new pitcher goes to P, the old pitcher goes to
 * `oldPitcherTo` (by default the new pitcher's old spot), and whoever was there takes the
 * new pitcher's old spot, so every spot stays filled. Spots are read at `atOut`.
 */
export function pitchingChangeMoves(
  lineup: Lineup,
  inning: number,
  atOut: number,
  newPitcherId: string,
  oldPitcherTo?: Position,
): Move[] {
  const at = (id: string) => positionAtOut(lineup, inning, id, atOut);
  const holderAt = (pos: Position) =>
    [...new Set(lineup.slots.filter((s) => s.inning === inning).map((s) => s.playerId))].find(
      (id) => at(id) === pos,
    );
  const oldPitcher = holderAt("P");
  const newPitcherFrom = at(newPitcherId);
  if (!newPitcherFrom || newPitcherFrom === "P") return [];
  const moves: Move[] = [{ playerId: newPitcherId, to: "P" }];
  if (!oldPitcher) return moves;
  const dest = oldPitcherTo ?? newPitcherFrom;
  moves.push({ playerId: oldPitcher, to: dest });
  if (dest !== newPitcherFrom && dest !== "BENCH") {
    const bumped = holderAt(dest);
    if (bumped && bumped !== newPitcherId) moves.push({ playerId: bumped, to: newPitcherFrom });
  }
  return moves;
}

/** Take back an inning's mid-inning changes: everyone keeps their spot from the start. */
export function undoMidInning(lineup: Lineup, inning: number): Lineup {
  const slots = lineup.slots
    .filter((s) => s.inning !== inning || outsOf(s).from === 0)
    .map((s) =>
      s.inning === inning ? { inning: s.inning, playerId: s.playerId, position: s.position } : s,
    );
  return { ...lineup, slots };
}

/** Who holds each field position in an inning (bench excluded). */
export function holdersByPosition(lineup: Lineup, inning: number): Map<Position, string> {
  const map = new Map<Position, string>();
  for (const s of lineup.slots) {
    if (s.inning === inning && s.position !== "BENCH") map.set(s.position, s.playerId);
  }
  return map;
}

/** Trade two players' spots in one inning (either may be empty), e.g. dragging one onto the other. */
export function swapInInning(lineup: Lineup, inning: number, a: string, b: string): Lineup {
  if (a === b) return lineup;
  const posA = positionAt(lineup, inning, a);
  const posB = positionAt(lineup, inning, b);
  const slots = lineup.slots.filter(
    (s) => !(s.inning === inning && (s.playerId === a || s.playerId === b)),
  );
  if (posB) slots.push({ inning, playerId: a, position: posB });
  if (posA) slots.push({ inning, playerId: b, position: posA });
  return { ...lineup, slots };
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

/** Take a player out of the batting order (they can still field) or put them back at the end. */
export function setBatting(lineup: Lineup, playerId: string, bats: boolean): Lineup {
  const notBatting = lineup.notBatting ?? [];
  if (bats) {
    return {
      ...lineup,
      notBatting: notBatting.filter((id) => id !== playerId),
      battingOrder: lineup.battingOrder.includes(playerId)
        ? lineup.battingOrder
        : [...lineup.battingOrder, playerId],
    };
  }
  return {
    ...lineup,
    battingOrder: lineup.battingOrder.filter((id) => id !== playerId),
    notBatting: notBatting.includes(playerId) ? notBatting : [...notBatting, playerId],
  };
}

/** Row order for grids and cards: batters in order, then players sitting out of batting. */
export function lineupRows(lineup: Lineup): { playerId: string; order: number | null }[] {
  return [
    ...lineup.battingOrder.map((playerId, i) => ({ playerId, order: i + 1 })),
    ...(lineup.notBatting ?? []).map((playerId) => ({ playerId, order: null })),
  ];
}

/**
 * Mark a player absent for this game (drops their positions and batting spot) or present
 * again (they bat last and need positions).
 */
export function setAbsent(lineup: Lineup, playerId: string, isAbsent: boolean): Lineup {
  const absent = lineup.absent ?? [];
  if (!isAbsent) {
    return {
      ...lineup,
      absent: absent.filter((id) => id !== playerId),
      battingOrder: lineup.battingOrder.includes(playerId)
        ? lineup.battingOrder
        : [...lineup.battingOrder, playerId],
    };
  }
  return {
    ...lineup,
    absent: absent.includes(playerId) ? absent : [...absent, playerId],
    battingOrder: lineup.battingOrder.filter((id) => id !== playerId),
    notBatting: (lineup.notBatting ?? []).filter((id) => id !== playerId),
    slots: lineup.slots.filter((s) => s.playerId !== playerId),
  };
}
