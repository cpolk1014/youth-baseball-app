// Player stats (box score imports and trends): a parent's own purchase on My
// profile, for a number of their kids, for one year from the day they buy. Not part of a
// team pass or club code; another parent who wants the stats buys their own.

export const FIRST_KID_CENTS = 1000;
export const MORE_KID_CENTS = 500;
export const MAX_KIDS = 10;

/** $10 for the first kid, $5 for each one after. */
export function statsPriceCents(kids: number): number {
  if (!Number.isInteger(kids) || kids < 1) return 0;
  return FIRST_KID_CENTS + MORE_KID_CENTS * (kids - 1);
}

export function validKids(kids: unknown): kids is number {
  return typeof kids === "number" && Number.isInteger(kids) && kids >= 1 && kids <= MAX_KIDS;
}
