import { describe, expect, it } from "vitest";
import type { Game } from "@/lib/data/types";
import type { GamePlace } from "@/lib/places/maps";
import { teamGameFor, describeChanges, placeOf, type ScheduleGame } from "./schedule";
import {
  addPlaces,
  cleanPlaces,
  cleanVenues,
  gamesAtVenues,
  venueFor,
  venueSearchText,
  venuesSavedNote,
} from "./venues";

const place = (name: string, placeId: string | null = `id-${name}`): GamePlace => ({
  name,
  address: `${name} address`,
  lat: 30,
  lng: -92,
  placeId,
});
const traction = place("Traction Sports Complex");
const parkview = place("Parkview Baseball Complex");

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  seasonId: "s1",
  date: "2026-11-14",
  startTime: "09:00",
  opponent: "Cubs",
  location: "Old Park",
  innings: 6,
  fieldPlayers: 9,
  status: "scheduled",
  ...over,
});

describe("cleanVenues", () => {
  it("tidies, drops blanks and lists each park once", () => {
    const r = cleanVenues({
      venues: [
        { name: "  Traction   Sports ", address: "1 Main St", city: null },
        { name: "traction sports", address: null, city: null },
        { name: "", address: "x", city: "y" },
        "nope",
      ],
      warnings: ["hard to read", 7],
    });
    expect(r.venues).toEqual([{ name: "Traction Sports", address: "1 Main St", city: null }]);
    expect(r.warnings).toEqual(["hard to read"]);
  });
  it("copes with nothing useful", () => {
    expect(cleanVenues(null)).toEqual({ venues: [], warnings: [] });
  });
});

describe("venueSearchText", () => {
  it("prefers the address, then the city, then the tournament's city", () => {
    const v = { name: "Parkview", address: "1 Main St", city: "Lafayette, LA" };
    expect(venueSearchText(v, "Houma, LA")).toBe("Parkview, 1 Main St");
    expect(venueSearchText({ ...v, address: null }, "Houma, LA")).toBe("Parkview, Lafayette, LA");
    expect(venueSearchText({ ...v, address: null, city: null }, "Houma, LA")).toBe(
      "Parkview, Houma, LA",
    );
    expect(venueSearchText({ ...v, address: null, city: null }, null)).toBe("Parkview");
  });
});

describe("cleanPlaces", () => {
  it("keeps good rows and blanks out bad parts", () => {
    expect(
      cleanPlaces([{ name: "A", address: 3, lat: "x", lng: 2, placeId: "p" }, { name: "" }]),
    ).toEqual([{ name: "A", address: null, lat: null, lng: 2, placeId: "p" }]);
    expect(cleanPlaces("nope")).toEqual([]);
  });
});

describe("addPlaces", () => {
  it("adds new parks after the old ones", () => {
    expect(addPlaces([traction], [parkview])).toEqual([traction, parkview]);
  });
  it("replaces a park already there, by map id or by name", () => {
    const pinned = { ...place("Traction Sports Complex"), address: "new" };
    expect(addPlaces([traction], [pinned])).toEqual([pinned]);
    const noPin = place("Parkview", null);
    const withPin = place("parkview", "abc");
    expect(addPlaces([noPin], [withPin])).toEqual([withPin]);
  });
  it("skips a blank name", () => {
    expect(addPlaces([], [place("   ")])).toEqual([]);
  });
});

describe("venueFor", () => {
  it("sends every game to the only park, whatever the schedule says", () => {
    expect(venueFor("Somewhere Else", [traction])).toBe(traction);
    expect(venueFor(null, [traction])).toBe(traction);
  });
  it("has nothing with no parks", () => {
    expect(venueFor("Traction", [])).toBeNull();
  });
  it("with several, goes by the park the schedule names", () => {
    const all = [traction, parkview];
    expect(venueFor("Parkview Baseball Complex", all)).toBe(parkview);
    expect(venueFor("Parkview Field 3", all)).toBe(parkview);
    expect(venueFor("TRACTION", all)).toBe(traction);
  });
  it("with several, stays out of it when the schedule doesn't say", () => {
    const all = [traction, parkview];
    expect(venueFor(null, all)).toBeNull();
    expect(venueFor("Field 3", all)).toBeNull();
    expect(venueFor("Girard Park", all)).toBeNull();
  });
  it("doesn't guess between two parks that match equally", () => {
    expect(venueFor("Moore", [place("Moore Park"), place("Moore Field Annex")])).toBeNull();
  });
});

describe("gamesAtVenues", () => {
  const row = (gameId: string | null, venue: string | null = null) => ({
    gameId,
    venue,
    field: "Field 2",
  });

  it("moves every one of our games to the only park and keeps the rest of the game", () => {
    const r = gamesAtVenues(
      [game("a", { field: "Field 9", opponent: "Reds" }), game("b"), game("other")],
      [row("a", "Parkview"), row("b"), row(null, "Parkview")],
      [traction],
    );
    expect(r.linked).toBe(2);
    expect(r.unmatched).toBe(0);
    expect(r.games.map((g) => g.id)).toEqual(["a", "b"]);
    expect(r.games[0]).toMatchObject({
      location: "Traction Sports Complex",
      locationAddress: "Traction Sports Complex address",
      locationLat: 30,
      locationLng: -92,
      locationPlaceId: "id-Traction Sports Complex",
      field: "Field 9",
      opponent: "Reds",
    });
  });

  it("leaves out games already there", () => {
    const there = game("a", {
      location: traction.name,
      locationAddress: traction.address,
      locationLat: traction.lat,
      locationLng: traction.lng,
      locationPlaceId: traction.placeId,
    });
    expect(gamesAtVenues([there], [row("a")], [traction]).games).toEqual([]);
  });

  it("counts games that name none of several parks and leaves them alone", () => {
    const r = gamesAtVenues(
      [game("a"), game("b")],
      [row("a", "Parkview"), row("b", "Girard Park")],
      [traction, parkview],
    );
    expect(r.games.map((g) => [g.id, g.location])).toEqual([["a", parkview.name]]);
    expect(r.unmatched).toBe(1);
  });

  it("does nothing with no parks left", () => {
    expect(gamesAtVenues([game("a")], [row("a")], [])).toEqual({
      games: [],
      unmatched: 0,
      linked: 0,
    });
  });
});

describe("venuesSavedNote", () => {
  it("says what happened", () => {
    const g = game("a");
    expect(venuesSavedNote({ games: [], unmatched: 0, linked: 0 })).toMatch(/Games added/);
    expect(venuesSavedNote({ games: [], unmatched: 0, linked: 2 })).toMatch(/already use it/);
    expect(venuesSavedNote({ games: [g], unmatched: 0, linked: 1 })).toBe("Saved. 1 game updated.");
    expect(venuesSavedNote({ games: [g, g], unmatched: 1, linked: 3 })).toBe(
      "Saved. 2 games updated. 1 game on the schedule at a different park stayed as it was.",
    );
  });
});

describe("the schedule with parks added", () => {
  const sg: ScheduleGame = {
    gameNo: "4",
    stage: "pool",
    pool: "A",
    round: null,
    date: "2026-11-14",
    startTime: "10:00",
    venue: "Parkview",
    field: "Field 3",
    home: "Us",
    away: "Cubs",
  };
  const opts = { id: "new", seasonId: "s1", fieldPlayers: 9 as const, venues: [] };

  it("gives a new team game the tournament's park with its map details", () => {
    const g = teamGameFor(sg, "Cubs", { ...opts, existing: null, places: [traction] });
    expect(g).toMatchObject({
      location: traction.name,
      locationAddress: traction.address,
      locationPlaceId: traction.placeId,
      field: "Field 3",
    });
  });

  it("moves a linked team game to the tournament's park", () => {
    const g = teamGameFor(sg, "Cubs", { ...opts, existing: game("a"), places: [traction] });
    expect(g).toMatchObject({ id: "a", location: traction.name, locationLat: 30 });
  });

  it("uses the schedule's park name when none of several parks match", () => {
    const g = teamGameFor({ ...sg, venue: "Girard Park" }, "Cubs", {
      ...opts,
      existing: null,
      places: [traction, parkview],
    });
    expect(g?.location).toBe("Girard Park");
    expect(g?.locationPlaceId).toBeUndefined();
  });

  it("shows the park's name on the schedule, without calling it a change", () => {
    const shown = { ...sg, parkName: traction.name };
    expect(placeOf(shown)).toBe("Traction Sports Complex · Field 3");
    expect(placeOf(sg)).toBe("Parkview · Field 3");
    expect(describeChanges(shown, sg)).toEqual([]);
  });
});
