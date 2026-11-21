// Innings split by outs. A lineup slot covers part of an inning, [fromOut, toOut), with no outs
// meaning the whole inning (0 to 3). Everything that counts playing time or checks a lineup
// looks at an inning as its "moments": the stretches between changes, each with who was where.
// Pure: no I/O.
import type { LineupSlot, Position } from "./types";

export const OUTS_PER_INNING = 3;

export function outsOf(slot: LineupSlot): { from: number; to: number } {
  const from = slot.fromOut ?? 0;
  const to = slot.toOut ?? OUTS_PER_INNING;
  return { from, to };
}

/** How much of an inning a slot is: 1 for the whole inning, ⅔ for outs 1 to 3. */
export function slotInnings(slot: LineupSlot): number {
  const { from, to } = outsOf(slot);
  return Math.max(0, to - from) / OUTS_PER_INNING;
}

export const isWholeInning = (slot: LineupSlot): boolean => {
  const { from, to } = outsOf(slot);
  return from === 0 && to === OUTS_PER_INNING;
};

export interface Moment {
  from: number;
  to: number;
  /** Share of the inning: (to − from) / 3. */
  weight: number;
  /** Where each player was during it (a list, so mistakes like two spots at once show up). */
  at: Map<string, Position[]>;
}

/** One inning's slots as its moments, in order. */
export function inningMoments(slots: LineupSlot[]): Moment[] {
  const breaks = new Set<number>([0, OUTS_PER_INNING]);
  for (const slot of slots) {
    const { from, to } = outsOf(slot);
    breaks.add(Math.min(Math.max(from, 0), OUTS_PER_INNING));
    breaks.add(Math.min(Math.max(to, 0), OUTS_PER_INNING));
  }
  const points = [...breaks].sort((a, b) => a - b);
  const moments: Moment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const mid = (from + to) / 2;
    const at = new Map<string, Position[]>();
    for (const slot of slots) {
      const o = outsOf(slot);
      if (o.from <= mid && mid < o.to) {
        const list = at.get(slot.playerId) ?? [];
        list.push(slot.position);
        at.set(slot.playerId, list);
      }
    }
    moments.push({ from, to, weight: (to - from) / OUTS_PER_INNING, at });
  }
  return moments;
}

/** Innings that have a mid-inning change. */
export function splitInnings(slots: LineupSlot[]): Set<number> {
  return new Set(slots.filter((s) => !isWholeInning(s)).map((s) => s.inning));
}

/**
 * A kid's spot for the inning as a whole: the bench when they sat 2 or more outs, else the
 * field spot they held longest (the later one on a tie). Whole innings are just their spot.
 */
export function primaryPosition(slots: LineupSlot[]): Position | undefined {
  if (!slots.length) return undefined;
  if (slots.length === 1) return slots[0]!.position;
  const outs = new Map<Position, number>();
  for (const slot of slots) {
    const { from, to } = outsOf(slot);
    outs.set(slot.position, (outs.get(slot.position) ?? 0) + (to - from));
  }
  if ((outs.get("BENCH") ?? 0) >= 2) return "BENCH";
  let best: Position | undefined;
  let most = -1;
  for (const slot of [...slots].sort((a, b) => outsOf(a).from - outsOf(b).from)) {
    if (slot.position === "BENCH") continue;
    const n = outs.get(slot.position)!;
    if (n >= most) {
      best = slot.position;
      most = n;
    }
  }
  return best ?? "BENCH";
}

const FRACTION: Record<number, string> = { 0: "", 1: "⅓", 2: "⅔" };

/** Innings for people: "3", "2⅔", "⅓", and "1½" for a change made halfway (outs not known). */
export function formatInnings(innings: number): string {
  const thirds = Math.round(innings * 6) / 2; // in thirds, to the nearest half third
  const whole = Math.floor(thirds / 3);
  const rest = thirds - whole * 3;
  if (Number.isInteger(rest)) {
    const part = FRACTION[rest] ?? "";
    return whole ? `${whole}${part}` : part || "0";
  }
  // Half a third short of a half inning: shown as a half (the "not sure" case).
  const half = Math.round(innings * 2) / 2;
  const w = Math.floor(half);
  return `${w || ""}${half - w ? "½" : ""}` || "0";
}
