import { describe, expect, it } from "vitest";
import {
  RULE_CATALOG,
  isChanged,
  recommendedRules,
  rulesFor,
  setRuleNumber,
  setRuleSetting,
} from "./catalog";
import { resolveRuleConfig } from "./config";

describe("rule catalog", () => {
  it("shows pitching rules only for kid pitch", () => {
    const kid = rulesFor(false).map((r) => r.id);
    const coach = rulesFor(true).map((r) => r.id);
    expect(kid).toContain("pitcher-rest");
    expect(kid).toContain("catcher-cannot-pitch");
    expect(coach).not.toContain("pitcher-rest");
    expect(coach).not.toContain("max-innings-pitched");
    expect(coach).not.toContain("catcher-cannot-pitch");
    expect(coach).not.toContain("pitcher-eligibility");
    expect(coach).toContain("catcher-eligibility");
    expect(coach).toContain("min-outfield");
  });

  it("describes rules in plain English with their numbers", () => {
    const c = resolveRuleConfig({ maxInningsPitched: 3, minInningsPlayedPercent: 100 });
    const text = (id: string) => RULE_CATALOG.find((r) => r.id === id)!.describe(c);
    expect(text("max-innings-pitched")).toBe("A pitcher pitches at most 3 innings a game");
    expect(text("min-innings-played")).toBe("Everyone plays at least every inning");
    expect(text("max-consecutive-bench")).toBe("No one sits more than 1 inning in a row");
    expect(text("min-innings-played").length).toBeGreaterThan(0);
  });

  it("changes a rule's setting and keeps numbers in range", () => {
    let input = setRuleSetting({}, "min-outfield", "block");
    const outfield = RULE_CATALOG.find((r) => r.id === "min-outfield")!;
    input = setRuleNumber(input, outfield, 9);
    const c = resolveRuleConfig(input);
    expect(c.severity["min-outfield"]).toBe("block");
    expect(c.minOutfieldInnings).toBe(4);
    expect(isChanged(c, outfield)).toBe(true);
    expect(isChanged(resolveRuleConfig(recommendedRules()), outfield)).toBe(false);
  });
});
