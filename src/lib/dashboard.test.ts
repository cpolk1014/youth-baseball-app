import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import type { AppData, Game, Practice } from "@/lib/data/types";
import { coachTodos, comingUp, lineupStatus, seasonRecord } from "./dashboard";

const game = (id: string, date: string, extra: Partial<Game> = {}): Game => ({
  id,
  seasonId: SEED_DATA.season.id,
  date,
  startTime: null,
  opponent: id,
  location: null,
  innings: 6,
  fieldPlayers: 9,
  status: "scheduled",
  ...extra,
});
const final = (id: string, date: string, us: number, them: number) =>
  game(id, date, { status: "final", scoreUs: us, scoreThem: them });

const practice = (id: string, date: string, extra: Partial<Practice> = {}): Practice => ({
  id,
  seasonId: SEED_DATA.season.id,
  date,
  startTime: null,
  endTime: null,
  location: null,
  focus: null,
  notes: null,
  plan: [],
  canceled: false,
  plays: [],
  ...extra,
});

const withData = (over: Partial<AppData>): AppData => ({
  ...SEED_DATA,
  lineups: {},
  ...over,
});

describe("seasonRecord", () => {
  it("counts results and runs, and finds the current streak", () => {
    const r = seasonRecord([
      final("a", "2026-09-01", 5, 2),
      final("b", "2026-09-08", 1, 4),
      final("c", "2026-09-15", 7, 3),
      final("d", "2026-09-22", 6, 6),
      final("e", "2026-09-29", 9, 1),
      final("f", "2026-10-06", 4, 3),
      game("g", "2026-10-13", { status: "final" }), // no score: left out
      game("h", "2026-11-01"),
    ]);
    expect([r.wins, r.losses, r.ties]).toEqual([4, 1, 1]);
    expect([r.runsFor, r.runsAgainst]).toEqual([32, 19]);
    expect(r.streak).toEqual({ result: "W", length: 2 });
    expect(r.lastFive).toEqual(["L", "W", "T", "W", "W"]);
  });

  it("has no streak before any scored game", () => {
    expect(seasonRecord([game("a", "2026-11-01")]).streak).toBeNull();
  });
});

describe("comingUp", () => {
  it("mixes games and practices from today on, soonest first, skipping canceled ones", () => {
    const items = comingUp(
      [game("past", "2026-11-01"), game("g1", "2026-11-05", { startTime: "18:00" })],
      [
        practice("p1", "2026-11-05", { startTime: "09:00" }),
        practice("off", "2026-11-04", { canceled: true }),
        practice("p2", "2026-11-03"),
      ],
      "2026-11-03",
    );
    expect(items.map((x) => (x.kind === "game" ? x.game.id : x.practice.id))).toEqual([
      "p2",
      "p1",
      "g1",
    ]);
  });
});

describe("lineupStatus and coachTodos", () => {
  it("flags games with no lineup, past games to mark final, and missing uniforms", () => {
    const data = withData({
      games: [
        game("Cubs", "2026-11-04"),
        game("Sox", "2026-10-30"),
        game("Far", "2026-12-30"),
        final("Done", "2026-10-20", 3, 2),
      ],
      uniforms: [
        {
          id: "u",
          name: "Home whites",
          shirt: "White",
          pants: null,
          hat: null,
          belt: null,
          socks: null,
        },
      ] as AppData["uniforms"],
    });
    expect(lineupStatus(data, data.games[0]!)).toEqual({ text: "No lineup yet", tone: "none" });
    expect(lineupStatus(data, data.games[3]!)).toEqual({ text: "W 3–2", tone: "win" });
    const todos = coachTodos(data, "2026-11-03");
    expect(todos.map((t) => t.key)).toEqual(["lineup-Cubs", "final-Sox", "uniform-Cubs"]);
    expect(todos[0]!.level).toBe("urgent");
  });
});
