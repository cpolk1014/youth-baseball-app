// Tournaments: the parks a tournament is played at, picked on the map or read from a picture.
// Once a park is added, the tournament's games use it: one park, every game; several, each
// game goes to the park named on the schedule (pure: no I/O).
import type { Game } from "@/lib/data/types";
import type { GamePlace } from "@/lib/places/maps";
import { teamKey } from "./event";

export const MAX_PLACES = 20;

export const VENUES_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["venues", "warnings"],
  properties: {
    venues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "address", "city"],
        properties: {
          name: { type: "string", description: "The park or complex, as shown." },
          address: { type: ["string", "null"], description: "Street address, if shown." },
          city: { type: ["string", "null"], description: "City, ST, if shown." },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export interface ReadVenue {
  name: string;
  address: string | null;
  city: string | null;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;

/** What came back from Claude, checked and tidied; each park once. */
export function cleanVenues(raw: unknown): { venues: ReadVenue[]; warnings: string[] } {
  const r = (raw ?? {}) as { venues?: unknown; warnings?: unknown };
  const seen = new Set<string>();
  const venues: ReadVenue[] = [];
  for (const v of Array.isArray(r.venues) ? r.venues : []) {
    const x = (v ?? {}) as Record<string, unknown>;
    const name = str(x.name, 80);
    if (!name || seen.has(teamKey(name))) continue;
    seen.add(teamKey(name));
    venues.push({ name, address: str(x.address, 200), city: str(x.city, 80) });
  }
  const warnings = Array.isArray(r.warnings)
    ? r.warnings.flatMap((w) => str(w, 300) ?? []).slice(0, 5)
    : [];
  return { venues: venues.slice(0, 6), warnings };
}

/** What to search the map for: the name plus the best hint of where it is. */
export function venueSearchText(v: ReadVenue, tournamentCity: string | null): string {
  return [v.name, v.address ?? v.city ?? tournamentCity].filter(Boolean).join(", ").slice(0, 100);
}

/** A tournament's saved parks, checked (they come back from the database as JSON). */
export function cleanPlaces(raw: unknown): GamePlace[] {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: GamePlace[] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const x = (p ?? {}) as Record<string, unknown>;
    const name = str(x.name, 80);
    if (!name) continue;
    out.push({
      name,
      address: str(x.address, 200),
      lat: num(x.lat),
      lng: num(x.lng),
      placeId: str(x.placeId, 300),
    });
  }
  return out.slice(0, MAX_PLACES);
}

const samePlace = (a: GamePlace, b: GamePlace) =>
  (!!a.placeId && a.placeId === b.placeId) || teamKey(a.name) === teamKey(b.name);

/** Add parks to the list. Adding one that's already there replaces it (it may have a pin now). */
export function addPlaces(existing: GamePlace[], adding: GamePlace[]): GamePlace[] {
  const out = [...existing];
  for (const raw of adding) {
    const p = { ...raw, name: raw.name.trim() };
    if (!p.name) continue;
    const i = out.findIndex((x) => samePlace(x, p));
    if (i >= 0) out[i] = p;
    else out.push(p);
  }
  return out.slice(0, MAX_PLACES);
}

// Words that say nothing about which park it is.
const COMMON = new Set(
  "the at of and park parks field fields complex sports sport baseball softball athletic athletics recreation rec center centre youth city memorial stadium diamond diamonds".split(
    " ",
  ),
);
const words = (s: string) =>
  new Set(
    teamKey(s)
      .split(" ")
      .filter((w) => w && !COMMON.has(w) && !/^\d+$/.test(w)),
  );

/**
 * The park a game is at, given what the schedule says ("Parkview · Field 3"). With one park,
 * that's every game. With several, the one the schedule names; null when it names none of
 * them or could be more than one.
 */
export function venueFor(scheduleText: string | null, places: GamePlace[]): GamePlace | null {
  if (places.length <= 1) return places[0] ?? null;
  if (!scheduleText?.trim()) return null;
  const exact = places.find((p) => teamKey(p.name) === teamKey(scheduleText));
  if (exact) return exact;
  const said = words(scheduleText);
  const scored = places
    .map((p) => ({ p, n: [...words(p.name)].filter((w) => said.has(w)).length }))
    .sort((a, b) => b.n - a.n);
  const [best, next] = scored;
  return best && best.n > 0 && best.n !== next?.n ? best.p : null;
}

/** The schedule's own words for where a game is. */
export const scheduleText = (g: { venue: string | null; field: string | null }) =>
  [g.venue, g.field].filter(Boolean).join(" ") || null;

/** A game at a park (its field and everything else stay). */
export function atPlace<T extends Game>(game: T, place: GamePlace): T {
  return {
    ...game,
    location: place.name,
    locationAddress: place.address,
    locationLat: place.lat,
    locationLng: place.lng,
    locationPlaceId: place.placeId,
  };
}

const isAt = (g: Game, p: GamePlace) =>
  g.location === p.name &&
  (g.locationAddress ?? null) === p.address &&
  (g.locationLat ?? null) === p.lat &&
  (g.locationLng ?? null) === p.lng &&
  (g.locationPlaceId ?? null) === p.placeId;

/**
 * Our games in the tournament, moved to its parks. `games` holds only the ones that change;
 * `unmatched` counts games whose schedule names none of several parks (they stay as they are).
 */
export function gamesAtVenues(
  teamGames: Game[],
  rows: { gameId: string | null; venue: string | null; field: string | null }[],
  places: GamePlace[],
): { games: Game[]; unmatched: number; linked: number } {
  const byId = new Map(teamGames.map((g) => [g.id, g]));
  const games: Game[] = [];
  let unmatched = 0;
  let linked = 0;
  if (places.length === 0) return { games, unmatched, linked };
  for (const row of rows) {
    const game = row.gameId ? byId.get(row.gameId) : undefined;
    if (!game) continue;
    linked += 1;
    const place = venueFor(scheduleText(row), places);
    if (!place) unmatched += 1;
    else if (!isAt(game, place)) games.push(atPlace(game, place));
  }
  return { games, unmatched, linked };
}

const count = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

/** What to tell the coach after saving. */
export function venuesSavedNote(r: { games: Game[]; unmatched: number; linked: number }): string {
  const stayed =
    r.unmatched > 0
      ? ` ${count(r.unmatched)} on the schedule at a different park stayed as ${r.unmatched === 1 ? "it was" : "they were"}.`
      : "";
  if (r.linked === 0) return "Saved. Games added to this tournament will use it.";
  if (r.games.length === 0) return `Saved. Your games already use it.${stayed}`;
  return `Saved. ${count(r.games.length)} updated.${stayed}`;
}
