import { describe, expect, it } from "vitest";
import { balanceOutliers, computeParticipation } from "./participation";
import { lineupFromGrid } from "./test-utils";

describe("computeParticipation", () => {
  it("counts games a player appears in", () => {
    const t = computeParticipation(
      [lineupFromGrid({ a: ["P", "BENCH"], b: ["C", "C"] }), lineupFromGrid({ a: ["SS", "SS"] })],
      ["P", "C", "SS"],
    );
    expect(t.a).toMatchObject({ games: 2, field: 3, bench: 1, infield: 3 });
    expect(t.b).toMatchObject({ games: 1, infield: 2 });
  });
});

describe("balanceOutliers", () => {
  it("compares each player to the team average for the games they played", () => {
    // Team plays ~3 infield innings a game. "late" joined for 1 game and got 3: on pace.
    // "short" played 4 games and got 4: about 8 behind.
    const stats = [
      { id: "a", infield: 12, bench: 4, games: 4 },
      { id: "b", infield: 14, bench: 4, games: 4 },
      { id: "late", infield: 3, bench: 1, games: 1 },
      { id: "short", infield: 4, bench: 12, games: 4 },
    ];
    const o = balanceOutliers(stats, 3);
    expect([...o.lowInfield]).toEqual(["short"]);
    expect([...o.highBench]).toEqual(["short"]);
    expect(o.expectedInfield.get("late")).toBeCloseTo(33 / 13);
  });

  it("matches a plain team average when everyone played every game", () => {
    const stats = [
      { id: "a", infield: 6, bench: 0, games: 2 },
      { id: "b", infield: 3, bench: 1, games: 2 },
      { id: "c", infield: 0, bench: 4, games: 2 },
    ];
    const o = balanceOutliers(stats, 2);
    expect(o.avgInfield).toBe(3);
    expect([...o.lowInfield]).toEqual(["c"]);
    expect([...o.highBench]).toEqual(["c"]);
  });
});
