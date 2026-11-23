import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import type { AppData, Game } from "@/lib/data/types";
import { clubSetup, coachSetup, setupProgress, teamSetup } from "./checklist";

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

const fresh: AppData = {
  ...SEED_DATA,
  players: [],
  games: [],
  lineups: {},
  members: [],
  team: { ...SEED_DATA.team, colors: [], logoPath: null },
};
const done = (d: AppData) =>
  Object.fromEntries(coachSetup(d, "2026-11-22").map((s) => [s.id, s.done]));

describe("coachSetup", () => {
  it("starts with nothing done, roster first", () => {
    const steps = coachSetup(fresh, "2026-11-22");
    expect(steps.map((s) => s.id)).toEqual(["roster", "games", "families", "lineup", "look"]);
    expect(setupProgress(steps)).toEqual({ done: 0, total: 5 });
    expect(steps[0]!.detail).toMatch(/import the roster/);
  });

  it("counts a roster once it's big enough to field a team", () => {
    const few = { ...fresh, players: SEED_DATA.players.slice(0, 5) };
    expect(done(few).roster).toBe(false);
    expect(coachSetup(few, "2026-11-22")[0]!.detail).toBe(
      "5 so far. Add the rest so lineups include everyone.",
    );
    const inactive = SEED_DATA.players.map((p) => ({ ...p, active: false }));
    expect(done({ ...fresh, players: inactive }).roster).toBe(false);
    expect(done({ ...fresh, players: SEED_DATA.players }).roster).toBe(true);
  });

  it("ticks off games, families, a lineup and the team's look", () => {
    const d: AppData = {
      ...fresh,
      games: [game("g1", "2026-11-28")],
      members: [{ id: "m1", userId: "u1", role: "parent", displayName: "Ana" }],
      lineups: { g1: {} as AppData["lineups"][string] },
      team: { ...fresh.team, colors: ["#13294B", "#F2A900"] },
    };
    expect(done(d)).toEqual({
      roster: false,
      games: true,
      families: true,
      lineup: true,
      look: true,
    });
  });

  it("a coach joining isn't a family; a logo alone is a look", () => {
    const d = {
      ...fresh,
      members: [{ id: "m1", userId: "u1", role: "coach" as const, displayName: "Dave" }],
      team: { ...fresh.team, logoPath: "team/logo.png" },
    };
    expect(done(d).families).toBe(false);
    expect(done(d).look).toBe(true);
  });

  it("sends the first lineup to the next game", () => {
    const d = {
      ...fresh,
      games: [
        game("past", "2026-11-14"),
        game("next", "2026-11-28"),
        game("later", "2026-12-05"),
        game("done", "2026-11-21", { status: "final" }),
      ],
    };
    expect(coachSetup(d, "2026-11-22").find((s) => s.id === "lineup")!.href).toBe("/games/next");
    expect(coachSetup(fresh, "2026-11-22").find((s) => s.id === "lineup")!.href).toBe("/games");
  });
});

describe("clubSetup", () => {
  it("walks a new director from look to teams", () => {
    const none = clubSetup({ hasLook: false, libraryItems: 0, codes: 0, teams: 0 });
    expect(none.map((s) => s.id)).toEqual(["look", "library", "codes", "teams"]);
    expect(setupProgress(none).done).toBe(0);
    const some = clubSetup({ hasLook: true, libraryItems: 2, codes: 10, teams: 0 });
    expect(some.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(
      setupProgress(clubSetup({ hasLook: true, libraryItems: 1, codes: 3, teams: 1 })),
    ).toEqual({ done: 4, total: 4 });
  });
});

describe("teamSetup", () => {
  it("names what a club team still needs", () => {
    expect(teamSetup({ players: 0, games: 0, lastLineupAt: null })).toEqual({
      done: 0,
      total: 3,
      missing: ["roster", "games", "a lineup"],
    });
    expect(teamSetup({ players: 12, games: 3, lastLineupAt: "2026-11-20T10:00:00Z" })).toEqual({
      done: 3,
      total: 3,
      missing: [],
    });
    expect(teamSetup({ players: 12, games: 2, lastLineupAt: null }).missing).toEqual(["a lineup"]);
  });
});
