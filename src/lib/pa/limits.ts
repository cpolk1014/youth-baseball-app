// How many AI clips each person and team can make per day (keeps costs predictable).
// Coaches and managers set up the whole team, so they get more songs than a family.

export type GenerationKind = "song" | "announce" | "sound";

export const DAILY_LIMITS: Record<
  GenerationKind,
  { perUser: number; perStaff: number; perTeam: number }
> = {
  song: { perUser: 15, perStaff: 40, perTeam: 120 },
  announce: { perUser: 40, perStaff: 40, perTeam: 150 },
  sound: { perUser: 20, perStaff: 20, perTeam: 60 },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "about 3 hours" / "about 20 minutes": how long until the oldest clip of the day drops off. */
export function waitText(oldestMine: string | null, now = Date.now()): string | null {
  if (!oldestMine) return null;
  const ms = new Date(oldestMine).getTime() + DAY_MS - now;
  if (!(ms > 0)) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Why another clip can't be made right now, or null. Limits count the last 24 hours. */
export function limitProblem(
  kind: GenerationKind,
  used: { mine: number; team: number },
  opts: { staff: boolean; oldestMine?: string | null; now?: number },
): string | null {
  const limit = DAILY_LIMITS[kind];
  const mine = opts.staff ? limit.perStaff : limit.perUser;
  const what = kind === "song" ? "songs" : kind === "announce" ? "announcer calls" : "sounds";
  if (used.mine >= mine) {
    const wait = waitText(opts.oldestMine ?? null, opts.now);
    return `You've made ${mine} ${what} in the last 24 hours. ${wait ? `You can make another in ${wait}.` : "Try again later."}`;
  }
  if (used.team >= limit.perTeam)
    return `Your team has made ${limit.perTeam} ${what} in the last 24 hours. Try again later.`;
  return null;
}
