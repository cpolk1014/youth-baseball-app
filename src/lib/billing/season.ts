// Paid seasons run August 1 to July 31 ("2026-27"), whenever a team, club or parent signs
// up. Youth baseball has two seasons in that year, fall and spring, so a team that starts in
// January pays the spring price instead of the full one. Clubs and the Player pass are one
// price all season. From June 1 only next season is sold, and the rest of this one comes
// free with it.

export const CLUB_PRICE_CENTS = 9900; // per team, for a club
export const TEAM_PRICE_CENTS = 12900; // one team on its own, for the full season
export const TEAM_SPRING_CENTS = 8900; // one team, from January 1 (spring only)
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

/** The season on sale today: this one, or from June next season (the rest of this one
 * comes free with it). */
export function seasonsOnSale(today: Date): string[] {
  const now = seasonFor(today);
  return today.getMonth() + 1 >= NEXT_SEASON_ON_SALE_MONTH && today.getMonth() < 7
    ? [nextSeason(now)]
    : [now];
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** January 1 of a season's second year, as YYYY-MM-DD: spring starts. */
export function springStarts(label: string): string {
  return `${Number(label.slice(0, 4)) + 1}-01-01`;
}

export interface Quote {
  season: string;
  /** What they pay. */
  cents: number;
  /** The full season's price. */
  fullCents: number;
  /** Bought from January 1: the spring price, January through July 31. */
  spring: boolean;
  /** Days of this season thrown in free when buying next season (June and July). */
  bonusDays: number;
  /** Last day, YYYY-MM-DD (July 31). */
  ends: string;
}

/**
 * The price for a season bought today: the full price, or from January 1 the spring price
 * when there is one (teams). Bought before the season starts (June and July), the rest of
 * this season comes free.
 */
export function quote(
  fullCents: number,
  season: string,
  today: Date = new Date(),
  springCents?: number,
): Quote {
  const start = utc(`${season.slice(0, 4)}-08-01`);
  const now = utc(isoDay(today));
  const spring = springCents !== undefined && now >= utc(springStarts(season));
  return {
    season,
    cents: spring ? Math.min(springCents, fullCents) : fullCents,
    fullCents,
    spring,
    bonusDays: now < start ? Math.round((start - now) / DAY) : 0,
    ends: seasonEnds(season),
  };
}

/** A team's price today: the full season, or spring from January 1. */
export function teamQuote(season: string, today: Date = new Date()): Quote {
  return quote(TEAM_PRICE_CENTS, season, today, TEAM_SPRING_CENTS);
}

/** "$2,574" */
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
