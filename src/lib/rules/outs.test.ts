import { describe, expect, it } from "vitest";
import {
  formatInnings,
  inningMoments,
  outsOf,
  primaryPosition,
  slotInnings,
  splitInnings,
} from "./outs";
import type { LineupSlot } from "./types";

const s = (playerId: string, position: LineupSlot["position"], from?: number, to?: number): LineupSlot => ({
  inning: 4,
  playerId,
  position,
  ...(from === undefined ? {} : { fromOut: from, toOut: to }),
});

describe("outs", () => {
  it("treats a slot with no outs as the whole inning", () => {
    expect(outsOf(s("a", "P"))).toEqual({ from: 0, to: 3 });
    expect(slotInnings(s("a", "P"))).toBe(1);
    expect(slotInnings(s("a", "P", 1, 3))).toBeCloseTo(2 / 3);
  });

  it("splits an inning into moments where anything changes", () => {
    // The coach's example: after 1 out, CF→P, LF→CF, P→LF.
    const slots = [
      s("jake", "CF", 0, 1),
      s("jake", "P", 1, 3),
      s("luke", "LF", 0, 1),
      s("luke", "CF", 1, 3),
      s("mason", "P", 0, 1),
      s("mason", "LF", 1, 3),
      s("ella", "SS"),
    ];
    const moments = inningMoments(slots);
    expect(moments.map((m) => [m.from, m.to])).toEqual([
      [0, 1],
      [1, 3],
    ]);
    expect(moments[0]!.at.get("jake")).toEqual(["CF"]);
    expect(moments[1]!.at.get("jake")).toEqual(["P"]);
    expect(moments[1]!.at.get("ella")).toEqual(["SS"]);
    expect(moments[1]!.weight).toBeCloseTo(2 / 3);
  });

  it("knows which innings were split", () => {
    expect(splitInnings([s("a", "P"), { ...s("b", "C", 0, 2), inning: 2 }])).toEqual(new Set([2]));
  });

  it("names a kid's main spot for the inning, and the bench after 2 or more outs sitting", () => {
    expect(primaryPosition([s("a", "CF", 0, 1), s("a", "P", 1, 3)])).toBe("P");
    expect(primaryPosition([s("a", "BENCH", 0, 2), s("a", "RF", 2, 3)])).toBe("BENCH");
    expect(primaryPosition([s("a", "RF", 0, 2), s("a", "BENCH", 2, 3)])).toBe("RF");
    expect(primaryPosition([s("a", "SS")])).toBe("SS");
    expect(primaryPosition([])).toBeUndefined();
  });

  it("shows innings in thirds", () => {
    expect(formatInnings(3)).toBe("3");
    expect(formatInnings(2 + 2 / 3)).toBe("2⅔");
    expect(formatInnings(1 / 3)).toBe("⅓");
    expect(formatInnings(1.5)).toBe("1½");
    expect(formatInnings(0)).toBe("0");
  });
});
