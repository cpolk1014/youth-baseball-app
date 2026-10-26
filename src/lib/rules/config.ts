import type { FieldPosition, RuleConfig } from "./types";

const NINE_FIELDERS: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const TEN_FIELDERS: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"];

/** Positions for a 9-fielder game (LF CF RF) or a 10-fielder game (LF LCF RCF RF). */
export function fieldPositionsFor(fieldPlayers: 9 | 10): FieldPosition[] {
  return [...(fieldPlayers === 10 ? TEN_FIELDERS : NINE_FIELDERS)];
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  coachPitch: false,
  fieldPositions: NINE_FIELDERS,
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

/** A game's rules: the season's rules, with the team's coach's pitch and the game's size. */
export function gameRuleConfig(
  seasonRules: RuleConfigInput,
  { coachPitch, fieldPlayers }: { coachPitch: boolean; fieldPlayers: 9 | 10 },
): RuleConfig {
  return {
    ...resolveRuleConfig(seasonRules),
    coachPitch,
    fieldPositions: fieldPositionsFor(fieldPlayers),
  };
}
