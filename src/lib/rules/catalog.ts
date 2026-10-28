import { DEFAULT_RULE_CONFIG, KID_PITCH_ONLY, type RuleConfigInput } from "./config";
import type { CoreRuleId, RuleConfig, RuleId, RuleSetting } from "./types";

/** Rules a coach can set (everything but the core rules). */
export type SettableRuleId = Exclude<RuleId, CoreRuleId>;

/** Settings that hold a rule's number. */
type NumberKey =
  | "maxConsecutiveBench"
  | "minInfieldInnings"
  | "minOutfieldInnings"
  | "minInningsPlayedPercent"
  | "maxInningsSamePosition"
  | "maxInningsPitched"
  | "pitcherRestInnings"
  | "seasonBalanceThreshold";

export interface RuleInfo {
  id: SettableRuleId;
  /** Plain-English rule, using the current number. */
  describe: (c: RuleConfig) => string;
  /** The rule's number, if it has one. */
  number?: { key: NumberKey; min: number; max: number; step?: number };
  /** Season balance can warn or be off, never must-follow. */
  canBlock: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const share = (pct: number) =>
  pct >= 100 ? "every inning" : pct === 50 ? "half the innings" : `${pct}% of the innings`;

/** Every settable rule, in the order the Fair play rules screen shows them. */
export const RULE_CATALOG: RuleInfo[] = [
  {
    id: "max-consecutive-bench",
    describe: (c) =>
      `No one sits more than ${plural(c.maxConsecutiveBench ?? 1, "inning")} in a row`,
    number: { key: "maxConsecutiveBench", min: 1, max: 3 },
    canBlock: true,
  },
  {
    id: "bench-rotation",
    describe: () => "Everyone sits once before anyone sits twice",
    canBlock: true,
  },
  {
    id: "min-innings-played",
    describe: (c) => `Everyone plays at least ${share(c.minInningsPlayedPercent)}`,
    number: { key: "minInningsPlayedPercent", min: 25, max: 100, step: 25 },
    canBlock: true,
  },
  {
    id: "min-infield",
    describe: (c) => `Everyone plays at least ${plural(c.minInfieldInnings, "infield inning")}`,
    number: { key: "minInfieldInnings", min: 1, max: 4 },
    canBlock: true,
  },
  {
    id: "min-outfield",
    describe: (c) => `Everyone plays at least ${plural(c.minOutfieldInnings, "outfield inning")}`,
    number: { key: "minOutfieldInnings", min: 1, max: 4 },
    canBlock: true,
  },
  {
    id: "max-same-position",
    describe: (c) =>
      `No one plays the same position more than ${plural(c.maxInningsSamePosition ?? 2, "inning")}`,
    number: { key: "maxInningsSamePosition", min: 1, max: 6 },
    canBlock: true,
  },
  {
    id: "catcher-eligibility",
    describe: () => "Only players marked “can catch” catch",
    canBlock: true,
  },
  {
    id: "pitcher-eligibility",
    describe: () => "Only players marked “can pitch” pitch",
    canBlock: true,
  },
  {
    id: "max-innings-pitched",
    describe: (c) =>
      `A pitcher pitches at most ${plural(c.maxInningsPitched ?? 2, "inning")} a game`,
    number: { key: "maxInningsPitched", min: 1, max: 6 },
    canBlock: true,
  },
  {
    id: "catcher-cannot-pitch",
    describe: () => "A catcher can't also pitch in the same game",
    canBlock: true,
  },
  {
    id: "pitcher-rest",
    describe: (c) =>
      `A pitcher who threw ${plural(c.pitcherRestInnings, "inning")} or more last game doesn't pitch the next`,
    number: { key: "pitcherRestInnings", min: 1, max: 6 },
    canBlock: true,
  },
  {
    id: "season-balance",
    describe: (c) =>
      `Flag kids ${plural(c.seasonBalanceThreshold ?? 3, "inning")} behind on infield or ahead on bench this season`,
    number: { key: "seasonBalanceThreshold", min: 1, max: 10 },
    canBlock: false,
  },
];

/** What every lineup must do, whatever the settings. */
export const CORE_RULE_TEXT = [
  "Every position is filled each inning",
  "No one plays two spots at once",
  "Everyone has a spot or the bench each inning",
  "Everyone is in the batting order (or marked as sitting out)",
];

/** The rules shown for coach's pitch or kid pitch teams. */
export function rulesFor(coachPitch: boolean): RuleInfo[] {
  return RULE_CATALOG.filter((r) => !(coachPitch && KID_PITCH_ONLY.includes(r.id)));
}

/** Change how a rule is treated. */
export function setRuleSetting(
  input: RuleConfigInput,
  id: SettableRuleId,
  setting: RuleSetting,
): RuleConfigInput {
  return { ...input, severity: { ...input.severity, [id]: setting } };
}

/** Change a rule's number, kept within its range. */
export function setRuleNumber(
  input: RuleConfigInput,
  info: RuleInfo,
  value: number,
): RuleConfigInput {
  if (!info.number) return input;
  const { key, min, max } = info.number;
  return { ...input, [key]: Math.min(max, Math.max(min, value)) };
}

/** Built-in rules back to the recommended settings; the coach's own rules stay. */
export function recommendedRules(input: RuleConfigInput = {}): RuleConfigInput {
  return input.custom?.length ? { custom: input.custom } : {};
}

/** Whether a rule differs from the recommended setting. */
export function isChanged(config: RuleConfig, info: RuleInfo): boolean {
  if (config.severity[info.id] !== DEFAULT_RULE_CONFIG.severity[info.id]) return true;
  return info.number ? config[info.number.key] !== DEFAULT_RULE_CONFIG[info.number.key] : false;
}
