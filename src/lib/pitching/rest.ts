// Pitch counts and rest days for one kid (pure). Limits follow MLB and USA Baseball's Pitch
// Smart guidelines for 7–14 year olds: a daily maximum by age, and days of rest by how many
// pitches they threw that day. Games (for any team) decide rest; bullpens and lessons don't,
// but throwing on a rest day is flagged.

export type PitchAges = "7-8" | "9-10" | "11-12" | "13-14";
export const PITCH_AGES: PitchAges[] = ["7-8", "9-10", "11-12", "13-14"];

/** Most pitches in a day, by age. */
export const DAILY_MAX: Record<PitchAges, number> = {
  "7-8": 50,
  "9-10": 75,
  "11-12": 85,
  "13-14": 95,
};

/** Days of rest after a day's pitches (the same for every age through 14): [up to, days]. */
export const REST_TABLE: [number, number][] = [
  [20, 0],
  [35, 1],
  [50, 2],
  [65, 3],
  [Infinity, 4],
];

export function restDays(pitches: number): number {
  if (pitches <= 0) return 0;
  return REST_TABLE.find(([upTo]) => pitches <= upTo)![1];
}

/** "10U" → "9-10"; "12U" → "11-12"; unknown → null. */
export function agesFromTeam(ageGroup: string | null | undefined): PitchAges | null {
  const n = Number(/(\d{1,2})/.exec(ageGroup ?? "")?.[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 8) return "7-8";
  if (n <= 10) return "9-10";
  if (n <= 12) return "11-12";
  return "13-14";
}

export type SessionKind = "game" | "bullpen" | "lesson" | "other_team";

export const KIND_LABEL: Record<SessionKind, string> = {
  game: "Game",
  bullpen: "Practice bullpen",
  lesson: "Pitching lesson",
  other_team: "Subbed with another team",
};

/** Games count toward rest days; bullpens and lessons don't. */
export const isGame = (kind: SessionKind) => kind === "game" || kind === "other_team";

export interface PitchSession {
  id: string;
  kind: SessionKind;
  /** YYYY-MM-DD */
  date: string;
  pitches: number;
  strikes: number | null;
  gameId: string | null;
  statId: string | null;
  label: string | null;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000,
  );

export interface ArmWarning {
  date: string;
  message: string;
}

export interface ArmStatus {
  ages: PitchAges;
  max: number;
  /** Game pitches today (all games), and how many more are allowed today. */
  today: number;
  leftToday: number;
  /** The first day they can pitch in a game again (today or earlier: ready now). */
  canPitchOn: string;
  /** Resting today (a required rest day after a game). */
  resting: boolean;
  /** The game day that set the current rest, if any. */
  restFrom: { date: string; pitches: number; days: number } | null;
  /** Every pitch in the last 7 days (today included), and in games only. */
  last7: number;
  last7Games: number;
  warnings: ArmWarning[];
}

/** Game pitches by day. */
function gameDays(sessions: PitchSession[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const s of sessions)
    if (isGame(s.kind)) days.set(s.date, (days.get(s.date) ?? 0) + s.pitches);
  return days;
}

/** Where a kid's arm stands today. */
export function armStatus(sessions: PitchSession[], ages: PitchAges, today: string): ArmStatus {
  const max = DAILY_MAX[ages];
  const days = gameDays(sessions.filter((s) => s.date <= today));
  const todayPitches = days.get(today) ?? 0;

  // The latest "can pitch again" from any earlier game day.
  let canPitchOn = today;
  let restFrom: ArmStatus["restFrom"] = null;
  for (const [date, pitches] of days) {
    if (date >= today) continue;
    const r = restDays(pitches);
    const next = addDays(date, r + 1);
    if (next > canPitchOn) {
      canPitchOn = next;
      restFrom = { date, pitches, days: r };
    }
  }
  const resting = canPitchOn > today;

  const weekStart = addDays(today, -6);
  const week = sessions.filter((s) => s.date >= weekStart && s.date <= today);
  return {
    ages,
    max,
    today: todayPitches,
    leftToday: resting ? 0 : Math.max(0, max - todayPitches),
    canPitchOn,
    resting,
    restFrom,
    last7: week.reduce((n, s) => n + s.pitches, 0),
    last7Games: week.filter((s) => isGame(s.kind)).reduce((n, s) => n + s.pitches, 0),
    warnings: armWarnings(sessions, ages),
  };
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Days over the limit, and any pitching on a required rest day (newest first). */
export function armWarnings(sessions: PitchSession[], ages: PitchAges): ArmWarning[] {
  const max = DAILY_MAX[ages];
  const days = gameDays(sessions);
  const warnings: ArmWarning[] = [];
  for (const [date, pitches] of days) {
    if (pitches > max) {
      warnings.push({
        date,
        message: `${pitches} pitches in games on ${shortDay(date)}, over the ${max} a day for ages ${ages}.`,
      });
    }
  }
  // Rest days after each game day: did they throw anything on one?
  const byDate = new Map<string, PitchSession[]>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const flagged = new Set<string>();
  for (const [date, pitches] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
    const r = restDays(pitches);
    for (let i = 1; i <= r; i++) {
      const d = addDays(date, i);
      if (flagged.has(d)) continue;
      const thrown = byDate.get(d) ?? [];
      if (thrown.length === 0) continue;
      flagged.add(d);
      const what = thrown.some((s) => isGame(s.kind))
        ? "Pitched in a game"
        : thrown.some((s) => s.kind === "lesson")
          ? "A pitching lesson"
          : "A bullpen";
      warnings.push({
        date: d,
        message: `${what} on ${shortDay(d)}, a rest day after ${pitches} pitches on ${shortDay(date)} (${r} day${r === 1 ? "" : "s"} of rest).`,
      });
    }
  }
  return warnings.sort((a, b) => b.date.localeCompare(a.date));
}

/** "today", "tomorrow", or "Tue, Nov 18" for when they can pitch again. */
export function whenLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return shortDay(date);
}
