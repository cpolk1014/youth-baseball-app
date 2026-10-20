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
});
