export const FIELD_POSITIONS = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "LCF",
  "RCF",
] as const;

export type FieldPosition = (typeof FIELD_POSITIONS)[number];
export type Position = FieldPosition | "BENCH";

export interface Player {
  id: string;
  name: string;
  jerseyNumber?: number | null;
  /** Empty means "no preference": the player can be put anywhere. */
  preferredPositions: FieldPosition[];
  canPitch: boolean;
  canCatch: boolean;
  /** Inactive players are ignored by the rules engine. Defaults to true. */
  active?: boolean;
}

export interface LineupSlot {
  /** 1-based inning number. */
  inning: number;
  playerId: string;
  position: Position;
}

export interface Lineup {
  innings: number;
  /** Continuous batting order: every active player bats once, unless sitting out. */
  battingOrder: string[];
  /** Players left out of the batting order for this game (they can still field). */
  notBatting?: string[];
  /** Players missing this game: no position, no batting spot. */
  absent?: string[];
  slots: LineupSlot[];
}

/** Lineups from earlier (final) games this season, used for season balance. */
export type SeasonHistory = Lineup[];

export type Severity = "warn" | "block";
/** How a coach wants a rule treated: must follow, warn, or ignored. */
export type RuleSetting = Severity | "off";

export type RuleId =
  | "invalid-slot"
  | "position-coverage"
  | "player-assignment"
  | "batting-order"
  | "max-consecutive-bench"
  | "bench-rotation"
  | "min-infield"
  | "max-same-position"
  | "pitcher-eligibility"
  | "catcher-eligibility"
  | "max-innings-pitched"
  | "catcher-cannot-pitch"
  | "min-outfield"
  | "min-innings-played"
  | "pitcher-rest"
  | "season-balance";

/** Rules every lineup must follow; they can't be turned off or softened. */
export const CORE_RULES = [
  "invalid-slot",
  "position-coverage",
  "player-assignment",
  "batting-order",
] as const satisfies readonly RuleId[];
export type CoreRuleId = (typeof CORE_RULES)[number];

export interface RuleConfig {
  /** Coach's pitch: P is a fielding spot, so pitching rules don't apply. */
  coachPitch: boolean;
  /** Positions that must be filled exactly once every inning. */
  fieldPositions: FieldPosition[];
  /** Positions that count as "infield" for the min-infield and season-balance rules. */
  infieldPositions: FieldPosition[];
  /** Positions that count as "outfield" for the min-outfield rule. */
  outfieldPositions: FieldPosition[];
  /** Max bench innings in a row. null disables the rule. */
  maxConsecutiveBench: number | null;
  /** Nobody sits a second time until everyone has sat once (within a game). */
  benchRotation: boolean;
  /** Min infield innings per player per game. 0 disables the rule. */
  minInfieldInnings: number;
  /** Min outfield innings per player per game. 0 disables the rule. */
  minOutfieldInnings: number;
  /** Each player plays at least this share of the game's innings (percent, rounded up). */
  minInningsPlayedPercent: number;
  /** A pitcher who threw at least this many innings last game doesn't pitch this game. */
  pitcherRestInnings: number;
  /** Max innings at any one position per game. null disables the rule. */
  maxInningsSamePosition: number | null;
  /** Max innings pitched per player per game. null disables the rule. */
  maxInningsPitched: number | null;
  /** A player who catches in a game can't pitch in it (and vice versa). */
  catcherCannotPitch: boolean;
  /**
   * Season balance: warn when a player's season infield innings are this far below the
   * team average, or bench innings this far above. null disables the rule.
   */
  seasonBalanceThreshold: number | null;
  /**
   * How each rule is treated: "block" (must follow), "warn", or "off". Core rules are always
   * "block"; season-balance is "warn" or "off" (it looks across games, so it never blocks).
   */
  severity: Record<RuleId, RuleSetting>;
}

export interface Violation {
  rule: RuleId;
  severity: Severity;
  message: string;
  playerId?: string;
  inning?: number;
}
