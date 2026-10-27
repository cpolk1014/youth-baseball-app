import type { Play, PlayCategory } from "../types";
import { BASE_HITS } from "./base-hits";
import { BUNTS } from "./bunts";
import { EXTRA_BASE_HITS } from "./extra-base-hits";
import { FLY_BALLS } from "./fly-balls";
import { FORCE_PLAYS } from "./force-plays";
import { GROUND_BALLS } from "./ground-balls";
import { RUNNER_ON_THIRD } from "./runner-on-third";
import { SPECIAL_PLAYS } from "./special";
import { STEALS_AND_PICKOFFS } from "./steals";

/** Every play in the library, in category order. */
export const PLAYS: readonly Play[] = [
  ...GROUND_BALLS,
  ...FORCE_PLAYS,
  ...RUNNER_ON_THIRD,
  ...BASE_HITS,
  ...EXTRA_BASE_HITS,
  ...FLY_BALLS,
  ...BUNTS,
  ...STEALS_AND_PICKOFFS,
  ...SPECIAL_PLAYS,
];

const BY_ID = new Map(PLAYS.map((p) => [p.id, p]));

export function playById(id: string): Play | undefined {
  return BY_ID.get(id);
}

export function playsIn(category: PlayCategory): Play[] {
  return PLAYS.filter((p) => p.category === category);
}

/** Known plays for a list of ids, in that order (unknown ids are skipped). */
export function playsFor(ids: readonly string[]): Play[] {
  return ids.flatMap((id) => BY_ID.get(id) ?? []);
}
