import { describe, expect, it } from "vitest";
import { lineupFromGrid, makePlayer } from "@/lib/rules/test-utils";
import {
  activePlayers,
  assignPosition,
  emptyLineup,
  lineupRows,
  moveBatter,
  normalizeLineup,
  positionAt,
  setAbsent,
  setBatting,
} from "./edit";

const players = [
  makePlayer("a", { jerseyNumber: 9 }),
  makePlayer("b", { jerseyNumber: 2 }),
  makePlayer("c", { jerseyNumber: 5, active: false }),
  makePlayer("d"),
];

describe("lineup editing", () => {
  it("orders active players by jersey number, no-number last", () => {
    expect(activePlayers(players).map((p) => p.id)).toEqual(["b", "a", "d"]);
    expect(emptyLineup(players, 4)).toEqual({
      innings: 4,
      battingOrder: ["b", "a", "d"],
      notBatting: [],
      absent: [],
      slots: [],
    });
  });

  it("assigns an open position", () => {
    const l = assignPosition(emptyLineup(players, 2), 1, "a", "SS");
    expect(positionAt(l, 1, "a")).toBe("SS");
    expect(positionAt(l, 2, "a")).toBeNull();
  });

  it("swaps when the position is taken", () => {
    const l = assignPosition(lineupFromGrid({ a: ["P"], b: ["C"] }), 1, "a", "C");
    expect(positionAt(l, 1, "a")).toBe("C");
    expect(positionAt(l, 1, "b")).toBe("P");
  });

  it("leaves the displaced player unassigned if the mover had no spot", () => {
    const l = assignPosition(lineupFromGrid({ a: [], b: ["C"] }), 1, "a", "C");
    expect(positionAt(l, 1, "a")).toBe("C");
    expect(positionAt(l, 1, "b")).toBeNull();
  });

  it("lets several players share the bench and clears with null", () => {
    let l = lineupFromGrid({ a: ["BENCH"], b: ["SS"] });
    l = assignPosition(l, 1, "b", "BENCH");
    expect([positionAt(l, 1, "a"), positionAt(l, 1, "b")]).toEqual(["BENCH", "BENCH"]);
    l = assignPosition(l, 1, "a", null);
    expect(positionAt(l, 1, "a")).toBeNull();
    expect(l.slots).toHaveLength(1);
  });

  it("normalizes against roster and game length", () => {
    const saved = lineupFromGrid({ a: ["P", "P", "P"], c: ["C", "C", "C"] }, ["c", "a"]);
    const l = normalizeLineup(saved, players, 2);
    expect(l.battingOrder).toEqual(["a", "b", "d"]);
    expect(l.slots).toEqual([
      { inning: 1, playerId: "a", position: "P" },
      { inning: 2, playerId: "a", position: "P" },
    ]);
  });

  it("moves a batter", () => {
    expect(moveBatter(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveBatter(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveBatter(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("takes a player out of the batting order and puts them back at the end", () => {
    const l = emptyLineup(players, 2); // b, a, d
    const out = setBatting(l, "a", false);
    expect(out.battingOrder).toEqual(["b", "d"]);
    expect(out.notBatting).toEqual(["a"]);
    expect(lineupRows(out)).toEqual([
      { playerId: "b", order: 1 },
      { playerId: "d", order: 2 },
      { playerId: "a", order: null },
    ]);
    const back = setBatting(out, "a", true);
    expect(back.battingOrder).toEqual(["b", "d", "a"]);
    expect(back.notBatting).toEqual([]);
    expect(setBatting(back, "a", true)).toEqual(back);
  });

  it("keeps players sitting out of batting when normalizing", () => {
    const l = normalizeLineup({ ...emptyLineup(players, 2), notBatting: ["a", "c"] }, players, 2);
    expect(l.battingOrder).toEqual(["b", "d"]);
    expect(l.notBatting).toEqual(["a"]); // c is inactive
  });

  it("marks a player absent for the game and back again", () => {
    let l = lineupFromGrid({ a: ["P", "C"], b: ["C", "P"], d: ["SS", "SS"] }, ["b", "a", "d"]);
    l = setBatting(l, "d", false);
    const away = setAbsent(setAbsent(l, "a", true), "d", true);
    expect(away.absent).toEqual(["a", "d"]);
    expect(away.battingOrder).toEqual(["b"]);
    expect(away.notBatting).toEqual([]);
    expect(away.slots.map((s) => s.playerId)).toEqual(["b", "b"]);
    const back = setAbsent(away, "a", false);
    expect(back.absent).toEqual(["d"]);
    expect(back.battingOrder).toEqual(["b", "a"]);
  });

  it("keeps absent players out when normalizing", () => {
    const l = normalizeLineup({ ...emptyLineup(players, 2), absent: ["a", "c"] }, players, 2);
    expect(l.battingOrder).toEqual(["b", "d"]);
    expect(l.absent).toEqual(["a"]); // c is inactive anyway
  });
});
