// "Where do I go?" plays: animated situations with a job for every position.

export const FIELDERS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"] as const;
export type Fielder = (typeof FIELDERS)[number];
export type Runner = "B" | "R1" | "R2" | "R3";
export type Actor = Fielder | Runner;

/** [time in seconds, x, y] on the 400 × 400 field drawing. */
export type Key = readonly [number, number, number];

export const PLAY_CATEGORIES = [
  "Ground balls",
  "Force plays",
  "Runner on third",
  "Base hits",
  "Extra-base hits",
  "Fly balls",
  "Bunts",
  "Steals & pickoffs",
  "Special plays",
] as const;
export type PlayCategory = (typeof PLAY_CATEGORIES)[number];

export interface Play {
  id: string;
  name: string;
  category: PlayCategory;
  /** Game situation, e.g. "Runner on first, nobody out". */
  situation: string;
  /** Runners on base when the play starts (the batter is always there). */
  runners: Exclude<Runner, "B">[];
  ball: Key[];
  /** Movement keyframes; actors left out stay where they start. */
  moves: Partial<Record<Actor, Key[]>>;
  /** Time a runner is put out (drawn faded after). */
  out?: Partial<Record<Actor, number>>;
  steps: [number, string][];
  /** What each player does: every fielder, the batter, and each runner on base. */
  jobs: Partial<Record<Actor, string>>;
  note?: string;
}

export const ACTOR_NAMES: Record<Actor, string> = {
  P: "Pitcher",
  C: "Catcher",
  "1B": "First Base",
  "2B": "Second Base",
  SS: "Shortstop",
  "3B": "Third Base",
  LF: "Left Field",
  CF: "Center Field",
  RF: "Right Field",
  B: "Batter-Runner",
  R1: "Runner on First",
  R2: "Runner on Second",
  R3: "Runner on Third",
};

/** Scorebook numbers. */
export const POSITION_NUMBER: Record<Fielder, number> = {
  P: 1,
  C: 2,
  "1B": 3,
  "2B": 4,
  "3B": 5,
  SS: 6,
  LF: 7,
  CF: 8,
  RF: 9,
};
