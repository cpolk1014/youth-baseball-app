// How many AI clips each person and team can make per day (keeps costs predictable).

export type GenerationKind = "song" | "announce" | "sound";

export const DAILY_LIMITS: Record<GenerationKind, { perUser: number; perTeam: number }> = {
  song: { perUser: 15, perTeam: 60 },
  announce: { perUser: 40, perTeam: 150 },
  sound: { perUser: 20, perTeam: 60 },
};

/** Why another clip can't be made today, or null. */
export function limitProblem(
  kind: GenerationKind,
  used: { mine: number; team: number },
): string | null {
  const limit = DAILY_LIMITS[kind];
  const what = kind === "song" ? "songs" : kind === "announce" ? "announcer calls" : "sounds";
  if (used.mine >= limit.perUser)
    return `You've made ${limit.perUser} ${what} today. Try again tomorrow.`;
  if (used.team >= limit.perTeam)
    return `Your team has made ${limit.perTeam} ${what} today. Try again tomorrow.`;
  return null;
}
