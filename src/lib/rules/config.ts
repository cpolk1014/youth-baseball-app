import type { RuleConfig } from "./types";

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  fieldPositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
  infieldPositions: ["P", "C", "1B", "2B", "3B", "SS"],
  maxConsecutiveBench: 1,
  benchRotation: true,
  minInfieldInnings: 1,
  maxInningsSamePosition: 2,
  maxInningsPitched: 2,
  catcherCannotPitch: true,
  seasonBalanceThreshold: 3,
  severity: {
    "invalid-slot": "block",
    "position-coverage": "block",
    "player-assignment": "block",
    "batting-order": "block",
    "max-consecutive-bench": "block",
    // Warn by default: with a single catcher the catcher never sits, so strict rotation
    // would make an otherwise fair lineup impossible.
    "bench-rotation": "warn",
    "min-infield": "block",
    // Warn by default so a team with one catcher can still field a legal lineup.
    "max-same-position": "warn",
    "pitcher-eligibility": "block",
    "catcher-eligibility": "block",
    "max-innings-pitched": "block",
    "catcher-cannot-pitch": "block",
  },
};

export type RuleConfigInput = Partial<Omit<RuleConfig, "severity">> & {
  severity?: Partial<RuleConfig["severity"]>;
};

/** Merge a season's stored (possibly partial) rules over the defaults. */
export function resolveRuleConfig(input: RuleConfigInput = {}): RuleConfig {
  return {
    ...DEFAULT_RULE_CONFIG,
    ...input,
    severity: { ...DEFAULT_RULE_CONFIG.severity, ...input.severity },
  };
}
