import { describe, expect, it } from "vitest";
import {
  CARD_H,
  CHAMPION_W,
  bracketTrees,
  bracketWinner,
  sideLabel,
  type BracketGame,
} from "./bracket";

const g = (
  no: string,
  time: string,
  home: string,
  away: string,
  over: Partial<BracketGame> = {},
): BracketGame => ({
  id: `b${no}`,
  gameNo: no,
  stage: "bracket",
  date: "2026-11-15",
  startTime: time,
  home,
  away,
  scoreHome: null,
  scoreAway: null,
  ...over,
});

// The 7-team bracket: seed 1 skips the first round.
const seven = [
  g("1", "09:00", "Seed 4", "Seed 5"),
  g("2", "10:45", "Seed 2", "Seed 7"),
  g("3", "14:15", "Seed 3", "Seed 6"),
  g("4", "12:30", "Seed 1", "Winner Game 1"),
  g("5", "16:00", "Winner Game 2", "Winner Game 3"),
  g("6", "17:45", "Winner Game 4", "Winner Game 5"),
];

const where = (t: ReturnType<typeof bracketTrees<BracketGame>>[number], no: string) =>
  t.games.find((p) => p.game.gameNo === no)!;

describe("bracketTrees", () => {
  it("draws the 7-team bracket in three columns, the way it was printed", () => {
    const trees = bracketTrees(seven);
    expect(trees).toHaveLength(1);
    const t = trees[0]!;
    expect(t.columns).toBe(3);
    expect(t.games).toHaveLength(6);
    expect(["1", "2", "3"].map((n) => where(t, n).column)).toEqual([0, 0, 0]);
    expect(["4", "5"].map((n) => where(t, n).column)).toEqual([1, 1]);
    expect(where(t, "6").column).toBe(2);
    expect(t.final.game.gameNo).toBe("6");
    // Top to bottom: 1, 2, 3 on the left; 4 above 5; the final between them.
    expect(where(t, "1").y).toBeLessThan(where(t, "2").y);
    expect(where(t, "2").y).toBeLessThan(where(t, "3").y);
    expect(where(t, "4").y).toBeLessThan(where(t, "6").y);
    expect(where(t, "6").y).toBeLessThan(where(t, "5").y);
    expect(t.lines).toHaveLength(5);
  });

  it("keeps cards apart and inside the drawing", () => {
    const t = bracketTrees(seven)[0]!;
    for (const column of [0, 1, 2]) {
      const ys = t.games
        .filter((p) => p.column === column)
        .map((p) => p.y)
        .sort((a, b) => a - b);
      ys.forEach((y, i) => {
        if (i) expect(y - ys[i - 1]!).toBeGreaterThanOrEqual(CARD_H);
      });
    }
    for (const p of t.games) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + CARD_H).toBeLessThanOrEqual(t.height);
    }
  });

  it("leaves room for the champion after the main bracket's final", () => {
    const t = bracketTrees(seven)[0]!;
    expect(t.width).toBe(where(t, "6").x + 196 + CHAMPION_W);
  });

  it("keeps its shape once teams are filled in", () => {
    const filled = [
      g("1", "09:00", "Cubs", "Reds", { scoreHome: 5, scoreAway: 2 }),
      g("2", "10:45", "Bats", "Aces"),
      g("3", "14:15", "Dogs", "Owls"),
      g("4", "12:30", "Hawks", "Cubs"),
      g("5", "16:00", "Winner Game 2", "Winner Game 3"),
      g("6", "17:45", "Winner Game 4", "Winner Game 5"),
    ];
    const t = bracketTrees(filled)[0]!;
    expect(where(t, "4").column).toBe(1);
    expect(t.lines).toHaveLength(5);
  });

  it("doesn't draw a team that lost as coming through that game", () => {
    const games = [
      g("1", "09:00", "Cubs", "Reds", { scoreHome: 5, scoreAway: 2 }),
      g("2", "12:00", "Reds", "Owls"),
    ];
    expect(bracketTrees(games)).toHaveLength(2);
  });

  it("draws a losers' game apart from the winners' side", () => {
    const games = [
      g("1", "09:00", "Seed 1", "Seed 4"),
      g("2", "10:00", "Seed 2", "Seed 3"),
      g("3", "12:00", "Winner Game 1", "Winner Game 2"),
      g("4", "13:00", "Loser Game 1", "Loser Game 2"),
    ];
    const trees = bracketTrees(games);
    expect(trees.map((t) => t.games.length)).toEqual([3, 1]);
  });

  it("ignores pool games, even with the same numbers", () => {
    const pool = g("1", "08:00", "Cubs", "Reds", { id: "p1", stage: "pool" });
    const t = bracketTrees([pool, ...seven])[0]!;
    expect(t.games.some((p) => p.game.id === "p1")).toBe(false);
    expect(t.games).toHaveLength(6);
  });

  it("copes with no numbers (each game stands alone) and with nothing at all", () => {
    expect(bracketTrees([])).toEqual([]);
    const loose = [
      g("", "09:00", "Seed 1", "Seed 2", { id: "x", gameNo: null }),
      g("", "10:00", "Seed 3", "Seed 4", { id: "y", gameNo: null }),
    ];
    expect(bracketTrees(loose)).toHaveLength(2);
  });

  it("doesn't let a game feed itself or a game before it", () => {
    const odd = [
      g("1", "09:00", "Winner Game 2", "Seed 1"),
      g("2", "10:00", "Winner Game 2", "Seed 2"),
    ];
    expect(bracketTrees(odd)).toHaveLength(2);
  });
});

describe("labels", () => {
  it("says what a side is", () => {
    expect(sideLabel("Seed 4")).toBe("Seed 4");
    expect(sideLabel("4")).toBe("Seed 4");
    expect(sideLabel("Winner Game 1")).toBe("Winner of Game 1");
    expect(sideLabel("L5")).toBe("Loser of Game 5");
    expect(sideLabel("1st Pool A")).toBe("1st Pool A");
    expect(sideLabel("Cubs")).toBe("Cubs");
  });
  it("finds the winner, not before a score or on a tie", () => {
    expect(bracketWinner(g("1", "09:00", "A", "B"))).toBeNull();
    expect(bracketWinner(g("1", "09:00", "A", "B", { scoreHome: 2, scoreAway: 2 }))).toBeNull();
    expect(bracketWinner(g("1", "09:00", "A", "B", { scoreHome: 1, scoreAway: 2 }))).toBe("away");
  });
});
