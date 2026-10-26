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
  | "season-balance";

export interface RuleConfig {
  /** Coach's pitch: P is a fielding spot, so pitching rules don't apply. */
  coachPitch: boolean;
  /** Positions that must be filled exactly once every inning. */
  fieldPositions: FieldPosition[];
  /** Positions that count as "infield" for the min-infield and season-balance rules. */
  infieldPositions: FieldPosition[];
  /** Max bench innings in a row. null disables the rule. */
  maxConsecutiveBench: number | null;
  /** Nobody sits a second time until everyone has sat once (within a game). */
  benchRotation: boolean;
  /** Min infield innings per player per game. 0 disables the rule. */
  minInfieldInnings: number;
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
  /** Severity per rule. season-balance is always "warn". */
  severity: Record<Exclude<RuleId, "season-balance">, Severity>;
}

export interface Violation {
  rule: RuleId;
  severity: Severity;
  message: string;
  playerId?: string;
  inning?: number;
}
