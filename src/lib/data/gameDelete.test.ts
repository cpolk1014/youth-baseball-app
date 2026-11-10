import { describe, expect, it } from "vitest";
import {
  canDeleteGame,
  gamesOffMessage,
  hasLineup,
  offerGamePost,
  unplayedTournamentGames,
} from "./gameDelete";
import type { Lineup } from "@/lib/rules/types";
import type { Game } from "./types";

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    date: "2026-11-14",
    startTime: "19:00",
    opponent: "Cubs",
    status: "scheduled",
    ...over,
  }) as Game;
const lineup = (over: Partial<Lineup> = {}): Lineup =>
  ({ slots: [], battingOrder: [], ...over }) as Lineup;

describe("canDeleteGame", () => {
  it("lets scheduled games go and makes final games reopen first", () => {
    expect(canDeleteGame({ status: "scheduled" })).toBe(true);
    expect(canDeleteGame({ status: "final" })).toBe(false);
  });
});

describe("hasLineup", () => {
  it("counts positions or a batting order as started", () => {
    expect(hasLineup(undefined)).toBe(false);
    expect(hasLineup(lineup())).toBe(false);
    expect(hasLineup(lineup({ battingOrder: ["p1"] }))).toBe(true);
    expect(hasLineup(lineup({ slots: [{ inning: 1, playerId: "p1", position: "P" }] }))).toBe(true);
  });
});

describe("offerGamePost", () => {
  const on = (date: string) => offerGamePost([{ date }], "2026-11-10");
  it("offers it from today through a week out", () => {
    expect(on("2026-11-10")).toBe(true);
    expect(on("2026-11-17")).toBe(true);
  });
  it("doesn't for past games or ones further out", () => {
    expect(on("2026-11-09")).toBe(false);
    expect(on("2026-11-18")).toBe(false);
  });
  it("offers it when any of several games is close, and crosses month ends", () => {
    expect(offerGamePost([{ date: "2027-03-01" }, { date: "2026-12-02" }], "2026-11-30")).toBe(
      true,
    );
  });
  it("doesn't until today is known", () => {
    expect(offerGamePost([{ date: "2026-11-10" }], "")).toBe(false);
  });
});

describe("gamesOffMessage", () => {
  it("names one game", () => {
    expect(gamesOffMessage([game()])).toBe(
      "Heads up: the game against Cubs on Sat, Nov 14 at 7:00 PM is off.",
    );
  });
  it("names the tournament", () => {
    expect(gamesOffMessage([game()], "Fall Classic")).toBe(
      "Heads up: the game against Cubs in Fall Classic on Sat, Nov 14 at 7:00 PM is off.",
    );
  });
  it("lists several", () => {
    expect(
      gamesOffMessage(
        [game(), game({ id: "g2", date: "2026-11-15", startTime: null, opponent: "Rays" })],
        "Fall Classic",
      ),
    ).toBe(
      "Heads up: we're not playing in Fall Classic. These games are off:\nSat, Nov 14 at 7:00 PM vs Cubs\nSun, Nov 15 vs Rays",
    );
  });
});

describe("unplayedTournamentGames", () => {
  it("takes our unplayed games, soonest first, and leaves final ones and other teams' games", () => {
    const later = game({ id: "later", date: "2026-11-15" });
    const soon = game({ id: "soon", date: "2026-11-14" });
    const done = game({ id: "done", status: "final" });
    const rows = [
      { id: "r1", gameId: "later" },
      { id: "r2", gameId: "soon" },
      { id: "r3", gameId: "done" },
      { id: "r4", gameId: null },
      { id: "r5", gameId: "gone" },
    ];
    const found = unplayedTournamentGames(rows, [later, soon, done]);
    expect(found.rowIds).toEqual(["r1", "r2"]);
    expect(found.games.map((g) => g.id)).toEqual(["soon", "later"]);
  });
});
