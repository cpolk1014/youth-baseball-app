import { describe, expect, it } from "vitest";
import { isRuleOn, resolveRuleConfig } from "./config";
import { GRID_12x6, ROSTER_12, lineupFromGrid, withCell } from "./test-utils";
import type { Violation } from "./types";
import { validateLineup } from "./validate";

const rulesIn = (vs: Violation[]): Violation["rule"][] =>
  [...new Set(vs.map((v) => v.rule))].sort();

describe("rule settings: must follow, warn, off", () => {
  // d sits innings 3 and 5 and plays 4: fine. Make d sit 3 in a row (3, 4, 5).
  const tooMuchBench = withCell(GRID_12x6, "d", 4, "BENCH");

  it("a rule that's off reports nothing; warn reports a warning", () => {
    const strict = validateLineup(ROSTER_12, lineupFromGrid(tooMuchBench), resolveRuleConfig(), []);
    expect(strict.some((v) => v.rule === "max-consecutive-bench" && v.severity === "block")).toBe(
      true,
    );

    const off = resolveRuleConfig({ severity: { "max-consecutive-bench": "off" } });
    expect(rulesIn(validateLineup(ROSTER_12, lineupFromGrid(tooMuchBench), off, []))).not.toContain(
      "max-consecutive-bench",
    );

    const warn = resolveRuleConfig({ severity: { "max-consecutive-bench": "warn" } });
    const v = validateLineup(ROSTER_12, lineupFromGrid(tooMuchBench), warn, []);
    expect(
      v.filter((x) => x.rule === "max-consecutive-bench").every((x) => x.severity === "warn"),
    ).toBe(true);
  });

  it("core rules can't be turned off, and season balance never blocks", () => {
    const c = resolveRuleConfig({
      severity: { "position-coverage": "off", "season-balance": "block" },
    });
    expect(c.severity["position-coverage"]).toBe("block");
    expect(c.severity["season-balance"]).toBe("warn");
    expect(isRuleOn(c, "position-coverage")).toBe(true);
  });

  it("pitching rules don't apply in coach's pitch", () => {
    const c = { ...resolveRuleConfig(), coachPitch: true };
    expect(isRuleOn(c, "max-innings-pitched")).toBe(false);
    expect(isRuleOn(c, "pitcher-rest")).toBe(false);
    expect(isRuleOn(c, "min-infield")).toBe(true);
  });
});

describe("new rules", () => {
  it("min outfield: everyone gets at least N outfield innings when it's on", () => {
    const on = resolveRuleConfig({ severity: { "min-outfield": "block" }, minOutfieldInnings: 1 });
    // In GRID_12x6, c never plays the outfield.
    const v = validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), on, []).filter(
      (x) => x.rule === "min-outfield",
    );
    expect(v.map((x) => x.playerId)).toContain("c");
    expect(v[0]?.message).toMatch(/outfield/);
    // Off by default.
    expect(
      validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), resolveRuleConfig(), []).some(
        (x) => x.rule === "min-outfield",
      ),
    ).toBe(false);
  });

  it("min innings played: each kid plays at least half the game by default (warning)", () => {
    // d plays 4 of 6. Bench d in innings 1 and 2 as well: plays 2 of 6.
    let grid = withCell(GRID_12x6, "d", 1, "BENCH");
    grid = withCell(grid, "d", 2, "BENCH");
    const v = validateLineup(ROSTER_12, lineupFromGrid(grid), resolveRuleConfig(), []).filter(
      (x) => x.rule === "min-innings-played" && x.playerId === "d",
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      severity: "warn",
      message: "D plays 2 of 6 innings (at least 3).",
    });
  });

  it("pitcher rest: whoever threw 2+ innings last game doesn't pitch this game", () => {
    const on = resolveRuleConfig({ severity: { "pitcher-rest": "block" } });
    const lastGame = lineupFromGrid(GRID_12x6); // a pitched innings 1–2
    const v = validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), on, [], lastGame).filter(
      (x) => x.rule === "pitcher-rest",
    );
    expect(v.map((x) => x.playerId).sort()).toEqual(["a", "c", "g"]);
    // No previous game, or the rule off: nothing.
    expect(
      validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), on, []).some(
        (x) => x.rule === "pitcher-rest",
      ),
    ).toBe(false);
    expect(
      validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), resolveRuleConfig(), [], lastGame).some(
        (x) => x.rule === "pitcher-rest",
      ),
    ).toBe(false);
  });
});
