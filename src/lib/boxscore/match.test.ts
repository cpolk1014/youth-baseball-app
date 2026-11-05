import { describe, expect, it } from "vitest";
import type { Game } from "@/lib/data/types";
import { matchBoxScore, sameOpponent } from "./match";

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  seasonId: "s1",
  date: "2027-02-15",
  startTime: "18:30",
  opponent: "LBC Rudy",
  location: null,
  innings: 6,
  fieldPlayers: 9,
  status: "final",
  ...over,
});
const box = (over = {}) => ({
  gameDate: "2027-02-15",
  opponent: "LBC Rudy 13U",
  ourRuns: 4,
  theirRuns: 6,
  ...over,
});

describe("matching a box score to a game", () => {
  const games = [
    game("a"),
    game("b", { date: "2027-02-16", opponent: "GE Pirates" }),
    game("c", { date: "2027-02-20", opponent: "TBD" }),
  ];

  it("finds the game by day and opponent, allowing for naming", () => {
    expect(matchBoxScore(box(), games)).toEqual({ kind: "one", game: games[0] });
    expect(sameOpponent("GE Pirates 13U", "ge pirates")).toBe(true);
    expect(sameOpponent("TBD", "TBD")).toBe(false);
  });

  it("refuses a box score that isn't from a game on the schedule", () => {
    const m = matchBoxScore(box({ gameDate: "2026-06-20" }), games);
    expect(m.kind).toBe("none");
    expect(m.kind === "none" && m.reason).toContain("Jun 20, 2026");
    expect(matchBoxScore(box({ gameDate: null, opponent: null }), games).kind).toBe("none");
  });

  it("offers that day's games when the opponent is named too differently", () => {
    expect(
      matchBoxScore(box({ gameDate: "2027-02-16", opponent: "Pirates of GE" }), games),
    ).toEqual({ kind: "pick", games: [games[1]] });
  });

  it("tells two games that day apart by the score, or lets the parent pick", () => {
    const twin = [
      game("g1", { startTime: "12:00", scoreUs: 6, scoreThem: 5 }),
      game("g2", { startTime: "09:00", scoreUs: 4, scoreThem: 6 }),
    ];
    expect(matchBoxScore(box(), twin)).toEqual({ kind: "one", game: twin[1] });
    expect(matchBoxScore(box({ ourRuns: null, theirRuns: null }), twin)).toEqual({
      kind: "pick",
      games: [twin[1], twin[0]],
    });
  });

  it("checks a box score uploaded from a game's own page", () => {
    expect(matchBoxScore(box(), games, games[0])).toEqual({ kind: "one", game: games[0] });
    expect(matchBoxScore(box(), games, games[1]).kind).toBe("none");
  });
});
