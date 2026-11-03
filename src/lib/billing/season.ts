// Paid seasons run August 1 to July 31 ("2026-27"), whenever a team or club signs up.

export const CLUB_PRICE_CENTS = 9900; // per team, for a club
export const TEAM_PRICE_CENTS = 12900; // one team on its own
export const MAX_CLUB_TEAMS = 200;
/** From this month on, next season is also on sale (clubs buy before August). */
const NEXT_SEASON_ON_SALE_MONTH = 6; // June

/** "2026-27" for a date from Aug 1, 2026 through Jul 31, 2027. */
export function seasonFor(date: Date): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 7 ? y : y - 1; // August is month 7
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function nextSeason(label: string): string {
  const start = Number(label.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The last day of a season: July 31 of its second year, as YYYY-MM-DD. */
export function seasonEnds(label: string): string {
  return `${Number(label.slice(0, 4)) + 1}-07-31`;
}

export function isSeasonLabel(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}$/.test(s)) return false;
  return Number(s.slice(5)) === (Number(s.slice(0, 4)) + 1) % 100;
}

/** Seasons on sale today: this one, and from June also the next. */
export function seasonsOnSale(today: Date): string[] {
  const now = seasonFor(today);
  return today.getMonth() + 1 >= NEXT_SEASON_ON_SALE_MONTH && today.getMonth() < 7
    ? [now, nextSeason(now)]
    : [now];
}

/** "$2,574" */
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
