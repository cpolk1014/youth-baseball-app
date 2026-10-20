import type { FieldPosition, Lineup, Player, Position } from "./types";

export function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    preferredPositions: [],
    canPitch: false,
    canCatch: false,
    ...overrides,
  };
}

/** Build a lineup from a players × innings grid: { a: ["P", "P", "BENCH"], ... }. */
export function lineupFromGrid(
  grid: Record<string, Position[]>,
  battingOrder: string[] = Object.keys(grid),
): Lineup {
  const innings = Math.max(...Object.values(grid).map((row) => row.length));
  const slots = Object.entries(grid).flatMap(([playerId, row]) =>
    row.map((position, i) => ({ inning: i + 1, playerId, position })),
  );
  return { innings, battingOrder, slots };
}

/** Copy of a grid with one cell changed. */
export function withCell(
  grid: Record<string, Position[]>,
  playerId: string,
  inning: number,
  position: Position,
): Record<string, Position[]> {
  const row = [...(grid[playerId] ?? [])];
  row[inning - 1] = position;
  return { ...grid, [playerId]: row };
}

// 12 players, 6 innings: satisfies every default rule with zero violations.
// Pitchers a (1–2), g (3–4), c (5–6). Catchers b, h, i, d.
export const GRID_12x6: Record<string, Position[]> = {
  a: ["P", "P", "1B", "BENCH", "3B", "LF"],
  b: ["C", "C", "2B", "BENCH", "SS", "CF"],
  c: ["1B", "SS", "3B", "BENCH", "P", "P"],
  d: ["2B", "LF", "BENCH", "LF", "BENCH", "C"],
  e: ["3B", "CF", "BENCH", "CF", "BENCH", "1B"],
  f: ["SS", "RF", "BENCH", "RF", "BENCH", "2B"],
  g: ["LF", "BENCH", "P", "P", "2B", "BENCH"],
  h: ["CF", "BENCH", "C", "C", "1B", "BENCH"],
  i: ["RF", "BENCH", "RF", "1B", "C", "BENCH"],
  j: ["BENCH", "1B", "SS", "2B", "LF", "3B"],
  k: ["BENCH", "2B", "LF", "3B", "CF", "SS"],
  l: ["BENCH", "3B", "CF", "SS", "RF", "RF"],
};

export const ROSTER_12: Player[] = Object.keys(GRID_12x6).map((id) =>
  makePlayer(id, {
    canPitch: ["a", "c", "g"].includes(id),
    canCatch: ["b", "d", "h", "i"].includes(id),
  }),
);

// 9 players, 4 innings: nobody sits. Pitchers p1, p3. Catchers p2, p4.
export const GRID_9x4: Record<string, Position[]> = {
  p1: ["P", "P", "SS", "SS"],
  p2: ["C", "C", "LF", "LF"],
  p3: ["1B", "1B", "P", "P"],
  p4: ["2B", "2B", "C", "C"],
  p5: ["3B", "3B", "CF", "CF"],
  p6: ["SS", "SS", "RF", "RF"],
  p7: ["LF", "LF", "1B", "1B"],
  p8: ["CF", "CF", "2B", "2B"],
  p9: ["RF", "RF", "3B", "3B"],
};

export const ROSTER_9: Player[] = Object.keys(GRID_9x4).map((id) =>
  makePlayer(id, { canPitch: ["p1", "p3"].includes(id), canCatch: ["p2", "p4"].includes(id) }),
);

/** n players with ids p1..pn. The first `pitchers` can pitch, the next `catchers` can catch. */
export function makeRoster(
  n: number,
  { pitchers = 4, catchers = 3 }: { pitchers?: number; catchers?: number } = {},
): Player[] {
  return Array.from({ length: n }, (_, i) =>
    makePlayer(`p${i + 1}`, {
      canPitch: i < pitchers,
      canCatch: i >= pitchers && i < pitchers + catchers,
    }),
  );
}

export const INFIELD: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS"];
