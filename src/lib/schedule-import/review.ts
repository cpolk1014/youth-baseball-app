// Turn what Claude read from a schedule file into reviewable rows. Pure.
import type { Game, Practice } from "@/lib/data/types";
import { practiceMinutes } from "@/lib/practice/schedule";
import type { ScheduleExtraction } from "./schema";

export interface ReviewPractice {
  key: string;
  /** Assigned once, so a retried save updates the same row instead of duplicating it. */
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  note: string | null;
  duplicate: boolean;
  selected: boolean;
}

export interface ReviewGame {
  key: string;
  id: string;
  date: string;
  startTime: string | null;
  opponent: string | null;
  location: string | null;
  note: string | null;
  tentative: boolean;
  duplicate: boolean;
  selected: boolean;
}

export interface ImportReview {
  practices: ReviewPractice[];
  games: ReviewGame[];
  warnings: string[];
  /** Entries dropped because their date couldn't be read. */
  skipped: number;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function time(s: string | null): string | null {
  return s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

const clean = (s: string | null) => (s && s.trim() ? s.trim() : null);

export function buildImportReview(
  extraction: ScheduleExtraction,
  existingPractices: Pick<Practice, "date" | "startTime">[],
  existingGames: Pick<Game, "date">[],
  makeId: () => string = () => crypto.randomUUID(),
): ImportReview {
  let skipped = 0;
  const practiceKeys = new Set(existingPractices.map((p) => `${p.date}|${p.startTime ?? ""}`));
  const gameDates = new Set(existingGames.map((g) => g.date));

  const practices = extraction.practices
    .filter((p) => validDate(p.date) || (skipped++, false))
    .map((p, i): ReviewPractice => {
      const startTime = time(p.start_time);
      const end = time(p.end_time);
      const endTime = startTime && end && practiceMinutes(startTime, end) === null ? null : end;
      const duplicate = practiceKeys.has(`${p.date}|${startTime ?? ""}`);
      return {
        key: `p${i}`,
        id: makeId(),
        date: p.date,
        startTime,
        endTime,
        location: clean(p.location),
        note: clean(p.note),
        duplicate,
        selected: !duplicate,
      };
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );

  const games = extraction.games
    .filter((g) => validDate(g.date) || (skipped++, false))
    .map((g, i): ReviewGame => {
      const duplicate = gameDates.has(g.date);
      return {
        key: `g${i}`,
        id: makeId(),
        date: g.date,
        startTime: time(g.start_time),
        opponent: clean(g.opponent),
        location: clean(g.location),
        note: clean(g.note),
        tentative: g.tentative,
        duplicate,
        selected: !duplicate && !g.tentative,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { practices, games, warnings: extraction.warnings.filter((w) => w.trim()), skipped };
}

export function toPractice(r: ReviewPractice, seasonId: string): Practice {
  return {
    id: r.id,
    seasonId,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    location: r.location,
    focus: null,
    notes: r.note,
    plan: [],
    canceled: false,
    plays: [],
  };
}

export function toGame(
  r: ReviewGame,
  { seasonId, fieldPlayers }: { seasonId: string; fieldPlayers: 9 | 10 },
): Game {
  return {
    id: r.id,
    seasonId,
    date: r.date,
    startTime: r.startTime,
    opponent: r.opponent ?? "TBD",
    location: r.location,
    innings: 6,
    fieldPlayers,
    status: "scheduled",
  };
}
