import { describe, expect, it } from "vitest";
import { formatLineupGrid } from "./format";
import { lineupFromGrid, makePlayer } from "./test-utils";

describe("formatLineupGrid", () => {
  it("prints players in batting order with bench as --", () => {
    const roster = [
      makePlayer("a", { name: "Ava", jerseyNumber: 7 }),
      makePlayer("b", { name: "Ben" }),
    ];
    const lineup = lineupFromGrid({ a: ["P", "BENCH"], b: ["C", "1B"] }, ["b", "a"]);
    expect(formatLineupGrid(roster, lineup)).toBe(
      ["           1   2", "1. Ben     C   1B", "2. #7 Ava  P   --"].join("\n"),
    );
  });

  it("marks missing slots with ?", () => {
    const lineup = { innings: 2, battingOrder: ["x"], slots: [] };
    expect(formatLineupGrid([], lineup)).toContain("?   ?");
  });

  it("lists players sitting out of batting after the batters", () => {
    const lineup = { ...lineupFromGrid({ a: ["P"], b: ["C"] }, ["b"]), notBatting: ["a"] };
    const text = formatLineupGrid(
      [makePlayer("a", { name: "Ava" }), makePlayer("b", { name: "Ben" })],
      lineup,
    );
    expect(text.split("\n").slice(1)).toEqual(["1. Ben  C", "-. Ava  P"]);
  });
});
