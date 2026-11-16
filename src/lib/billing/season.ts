// Paid seasons run August 1 to July 31 ("2026-27"), whenever a team, club or parent signs
// up. Joining after August 1 is prorated by the days left (never under a quarter of the
// price); from June 1 only next season is sold, and the rest of this one comes free with it.

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

/** The season on sale today: this one, or from June next season (the rest of this one
 * comes free with it). */
export function seasonsOnSale(today: Date): string[] {
  const now = seasonFor(today);
  return today.getMonth() + 1 >= NEXT_SEASON_ON_SALE_MONTH && today.getMonth() < 7
    ? [nextSeason(now)]
    : [now];
}

/** Prorating never goes below this share of the price. */
export const PRORATE_FLOOR = 0.25;
const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface Quote {
  season: string;
  /** What they pay. */
  cents: number;
  /** The full season's price. */
  fullCents: number;
  /** Days of the season they get, counting today (all of them for a season not started). */
  daysLeft: number;
  /** Days in the season (365, or 366 with a February 29). */
  seasonDays: number;
  /** The quarter-price minimum kicked in. */
  floor: boolean;
  /** Days of this season thrown in free when buying next season (June and July). */
  bonusDays: number;
  /** Last day, YYYY-MM-DD (July 31). */
  ends: string;
}

/**
 * The price for a season bought today: the full price before it starts (with the rest of
 * this season free), or the share of days left once it's going, rounded to whole dollars and
 * never under a quarter of the price.
 */
export function quote(fullCents: number, season: string, today: Date = new Date()): Quote {
  const start = utc(`${season.slice(0, 4)}-08-01`);
  const ends = seasonEnds(season);
  const end = utc(ends);
  const now = utc(isoDay(today));
  const seasonDays = Math.round((end - start) / DAY) + 1;
  if (now < start) {
    return {
      season,
      cents: fullCents,
      fullCents,
      daysLeft: seasonDays,
      seasonDays,
      floor: false,
      bonusDays: Math.round((start - now) / DAY),
      ends,
    };
  }
  const daysLeft = Math.max(0, Math.round((end - now) / DAY) + 1);
  const share = Math.round((fullCents * daysLeft) / seasonDays / 100) * 100;
  const least = Math.ceil((fullCents * PRORATE_FLOOR) / 100) * 100;
  const cents = Math.min(fullCents, Math.max(share, least));
  return {
    season,
    cents,
    fullCents,
    daysLeft,
    seasonDays,
    floor: share < least,
    bonusDays: 0,
    ends,
  };
}

/** "$2,574" */
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
