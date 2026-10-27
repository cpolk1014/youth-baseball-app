import { START, type Pt } from "./field";
import { FIELDERS, type Actor, type Key, type Play } from "./types";

/** Actors on the field for a play: fielders, the batter, and any runners on base. */
export function actorsIn(play: Play): Actor[] {
  return [...FIELDERS, "B", ...play.runners];
}

/** Keyframes for an actor, starting from their spot at time 0. */
export function keysFor(play: Play, actor: Actor): Key[] {
  const start = START[actor];
  const keys = play.moves[actor];
  if (!keys || keys.length === 0) return [[0, start[0], start[1]]];
  return keys[0]![0] > 0 ? [[0, start[0], start[1]], ...keys] : keys;
}

/** Position along keyframes at a time (linear between keys, held at the ends). */
export function positionAt(keys: readonly Key[], time: number): Pt {
  const first = keys[0]!;
  if (time <= first[0]) return [first[1], first[2]];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (time <= b[0]) {
      const a = keys[i - 1]!;
      const f = (time - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  const last = keys[keys.length - 1]!;
  return [last[1], last[2]];
}

/** Length of the animation: the last movement plus a beat to read the ending. */
export function playDuration(play: Play): number {
  const times = [
    ...play.ball.map((key) => key[0]),
    ...Object.values(play.moves).flatMap((keys) => (keys ?? []).map((key) => key[0])),
  ];
  return Math.max(0, ...times) + 0.9;
}

/** Index of the step being shown at a time (-1 before the first). */
export function stepAt(play: Play, time: number): number {
  let current = -1;
  play.steps.forEach((s, i) => {
    if (time >= s[0]) current = i;
  });
  return current;
}
