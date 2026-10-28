import { CORE_RULES, type FieldPosition, type RuleConfig, type RuleId } from "./types";

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
  outfieldPositions: ["LF", "CF", "RF", "LCF", "RCF"],
  maxConsecutiveBench: 1,
  benchRotation: true,
  minInfieldInnings: 1,
  minOutfieldInnings: 1,
  minInningsPlayedPercent: 50,
  pitcherRestInnings: 2,
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
    "min-outfield": "off",
    "min-innings-played": "warn",
    "pitcher-rest": "off",
    "season-balance": "warn",
  },
};

export type RuleConfigInput = Partial<Omit<RuleConfig, "severity">> & {
  severity?: Partial<RuleConfig["severity"]>;
};

/** Merge a season's stored (possibly partial) rules over the defaults. */
export function resolveRuleConfig(input: RuleConfigInput = {}): RuleConfig {
  const severity = { ...DEFAULT_RULE_CONFIG.severity, ...input.severity };
  // Core rules always block, and season balance never does.
  for (const id of CORE_RULES) severity[id] = "block";
  if (severity["season-balance"] === "block") severity["season-balance"] = "warn";
  return { ...DEFAULT_RULE_CONFIG, ...input, severity };
}

/** Rules that don't apply in coach's pitch (P is a fielding spot there). */
export const KID_PITCH_ONLY: readonly RuleId[] = [
  "pitcher-eligibility",
  "max-innings-pitched",
  "catcher-cannot-pitch",
  "pitcher-rest",
];

/** Whether a rule is checked at all for this game. */
export function isRuleOn(config: RuleConfig, rule: RuleId): boolean {
  if (config.coachPitch && KID_PITCH_ONLY.includes(rule)) return false;
  return config.severity[rule] !== "off";
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
