import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, fieldPositionsFor, gameRuleConfig } from "./config";

describe("field positions by game size", () => {
  it("uses LF CF RF for 9 fielders and LF LCF RCF RF for 10", () => {
    expect(fieldPositionsFor(9)).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]);
    expect(fieldPositionsFor(10)).toEqual([
      "P",
      "C",
      "1B",
      "2B",
      "3B",
      "SS",
      "LF",
      "LCF",
      "RCF",
      "RF",
    ]);
  });

  it("builds a game's config from season rules, team and game", () => {
    const c = gameRuleConfig({ maxInningsPitched: 3 }, { coachPitch: true, fieldPlayers: 10 });
    expect(c.maxInningsPitched).toBe(3);
    expect(c.coachPitch).toBe(true);
    expect(c.fieldPositions).toEqual(fieldPositionsFor(10));
    expect(gameRuleConfig({}, { coachPitch: false, fieldPlayers: 9 }).fieldPositions).toEqual(
      DEFAULT_RULE_CONFIG.fieldPositions,
    );
  });
});
