// A kid's stats by year: which years have games, the games in the years picked, and how to
// say which years those are (pure).
import type { KidGame } from "./stats";

export type YearPick = "all" | number[];

export const yearOf = (g: Pick<KidGame, "gameDate">) => Number(g.gameDate.slice(0, 4));

/** Years with games, newest first. */
export function yearsOf(games: Pick<KidGame, "gameDate">[]): number[] {
  return [...new Set(games.map(yearOf))].sort((a, b) => b - a);
}

/** The year to open on: this year if it has games, else the latest that does. */
export function defaultYears(years: number[], thisYear: number): YearPick {
  if (years.length <= 1) return "all";
  return [years.includes(thisYear) ? thisYear : years[0]!];
}

export function inYears<T extends Pick<KidGame, "gameDate">>(games: T[], pick: YearPick): T[] {
  return pick === "all" ? games : games.filter((g) => pick.includes(yearOf(g)));
}

/** Tap a year: All → just that year; otherwise add or drop it (never down to none). */
export function toggleYear(pick: YearPick, year: number): YearPick {
  if (pick === "all") return [year];
  const next = pick.includes(year) ? pick.filter((y) => y !== year) : [...pick, year];
  return next.length === 0 ? pick : next.sort((a, b) => a - b);
}

/** "2027", "2025 and 2027", "2024, 2025 and 2027", or "all years". */
export function yearsLabel(pick: YearPick): string {
  if (pick === "all") return "all years";
  const ys = [...pick].sort((a, b) => a - b).map(String);
  return ys.length === 1 ? ys[0]! : `${ys.slice(0, -1).join(", ")} and ${ys.at(-1)}`;
}
