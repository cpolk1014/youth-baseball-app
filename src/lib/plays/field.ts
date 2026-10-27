import type { Actor, Key } from "./types";

// Field drawing coordinates (viewBox 400 × 400): home plate at the bottom, center field up.
export type Pt = readonly [number, number];

/** Where everyone stands before the pitch. */
export const START: Record<Actor, Pt> = {
  P: [200, 305],
  C: [200, 385],
  "1B": [262, 282],
  "2B": [232, 240],
  SS: [168, 240],
  "3B": [138, 282],
  LF: [110, 170],
  CF: [200, 130],
  RF: [290, 170],
  B: [210, 368],
  R1: [276, 294],
  R2: [192, 238],
  R3: [140, 310],
};

/** Named spots used when writing plays. */
export const S = {
  hit: [200, 365],
  mound: [200, 305],
  plate: [200, 372], // fielder covering home
  home: [200, 370], // runner arriving home
  bag1: [268, 298], // fielder on first
  first: [270, 300], // runner arriving at first
  past1: [288, 284], // batter running through first
  bag2: [203, 233],
  second: [205, 237],
  bag3: [133, 298],
  third: [131, 301],
  buFirstC: [248, 338], // catcher backing up first
  buFirstRF: [302, 266], // right fielder backing up first
  buSecondCF: [200, 192],
  buThirdLF: [112, 262],
  buThirdP: [116, 326], // pitcher backing up third
  buHomeP: [200, 394], // pitcher backing up home
  half12: [236, 266], // halfway between first and second
} as const satisfies Record<string, Pt>;

export const k = (t: number, p: Pt): Key => [t, p[0], p[1]];

/** A point part of the way from a to b (f = 0 → a, 1 → b). */
export const toward = (a: Pt, b: Pt, f: number): Pt => [
  Math.round(a[0] + (b[0] - a[0]) * f),
  Math.round(a[1] + (b[1] - a[1]) * f),
];

// Common runner paths.
export const batterToFirst = (t0 = 0.3): Key[] => [
  k(t0, START.B),
  k(t0 + 2, S.first),
  k(t0 + 2.4, S.past1),
];
/** Single: round first, look, come back. */
export const batterRounds = (t0 = 0.3): Key[] => [
  k(t0, START.B),
  k(t0 + 1.6, S.first),
  k(t0 + 2.1, [256, 278]),
  k(t0 + 2.7, [268, 298]),
];
export const batterToSecond = (t0 = 0.3): Key[] => [
  k(t0, START.B),
  k(t0 + 1.6, S.first),
  k(t0 + 3, S.second),
];
export const batterToThird = (t0 = 0.3): Key[] => [
  k(t0, START.B),
  k(t0 + 1.6, S.first),
  k(t0 + 2.9, S.second),
  k(t0 + 4.1, S.third),
];
