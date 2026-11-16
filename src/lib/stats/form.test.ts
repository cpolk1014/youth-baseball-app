import { describe, expect, it } from "vitest";
import { cleanBatting, cleanPitching, type KidGame } from "@/lib/boxscore/stats";
import type { TeamStats } from "./gamechanger";
import { boxSeasonLines, recentFromBoxScores, recentFromImports } from "./form";

let n = 0;
const game = (
  playerId: string,
  gameDate: string,
  batting: Record<string, number>,
  more: Partial<KidGame> = {},
): KidGame => ({
  id: `g${++n}`,
  playerId,
  gameDate,
  opponent: "Bandits",
  ourRuns: 5,
  theirRuns: 3,
  teamName: "Bombers",
  boxName: null,
  batting: cleanBatting(batting),
  pitching: null,
  errors: 0,
  positions: [],
  ...more,
});

describe("recentFromBoxScores", () => {
  const lines = [
    game("a", "2026-10-20", { ab: 4, h: 0 }), // too long ago
    game("a", "2026-11-05", { ab: 4, h: 2, bb: 1 }),
    game("a", "2026-11-12", { ab: 3, h: 2, doubles: 1 }),
    game("a", "2026-11-16", { ab: 4, h: 4 }), // the game being built: not counted
    game("b", "2026-11-12", {}, { pitchOnly: true, pitching: cleanPitching({ pitches: 40 }) }),
  ];
  it("adds up the last two weeks before the game", () => {
    const r = recentFromBoxScores(lines, "2026-11-16");
    expect(r.get("a")).toMatchObject({
      pa: 8,
      ab: 7,
      h: 4,
      games: 2,
      from: "2026-11-05",
      to: "2026-11-12",
      source: "box",
    });
    expect(r.get("a")!.obp).toBeCloseTo(5 / 8);
    expect(r.has("b")).toBe(false);
  });
});

describe("boxSeasonLines", () => {
  it("makes season lines from box scores, with innings from the lineups", () => {
    const lines = [
      game(
        "a",
        "2026-11-05",
        { ab: 3, h: 1 },
        { pitching: cleanPitching({ outs: 6, h: 2, bb: 1, pitches: 30 }) },
      ),
      game("a", "2026-11-12", { ab: 3, h: 2 }),
      game("a", "2026-11-13", {}, { pitchOnly: true, pitching: cleanPitching({ pitches: 20 }) }),
    ];
    const s = boxSeasonLines(lines, { a: { SS: 8 } }).get("a")!;
    expect(s.pa).toBe(6);
    expect(s.ip).toBe(2);
    expect(s.whip).toBeCloseTo(1.5);
    expect(s.fpct).toBeNull();
    expect(s.innings).toEqual({ SS: 8 });
  });
});

describe("recentFromImports", () => {
  const cols = ["PA", "AB", "H", "BB", "2B"].map((key) => ({
    group: "Batting",
    key,
    description: null,
  }));
  const imp = (importedAt: string, values: string[]): { importedAt: string; data: TeamStats } => ({
    importedAt,
    data: {
      columns: cols,
      players: [{ number: "7", first: "Mason", last: "R", values, playerId: "m" }],
      totals: null,
    },
  });

  it("takes the latest import minus the one about two weeks before it", () => {
    const r = recentFromImports([
      imp("2026-10-01T18:00:00Z", ["10", "10", "1", "0", "0"]),
      imp("2026-11-01T18:00:00Z", ["22", "20", "4", "2", "0"]),
      imp("2026-11-08T18:00:00Z", ["30", "28", "6", "2", "1"]),
      imp("2026-11-15T18:00:00Z", ["44", "40", "12", "4", "2"]),
    ]).get("m")!;
    // Nov 15 minus Nov 1: 22 PA, 20 AB, 8 H, 2 BB, 2 2B.
    expect(r).toMatchObject({
      pa: 22,
      ab: 20,
      h: 8,
      from: "2026-11-01",
      to: "2026-11-15",
      source: "imports",
    });
    expect(r.avg).toBeCloseTo(0.4);
  });

  it("needs imports at least a week apart", () => {
    expect(
      recentFromImports([
        imp("2026-11-12T18:00:00Z", ["22", "20", "4", "2", "0"]),
        imp("2026-11-15T18:00:00Z", ["30", "28", "6", "2", "1"]),
      ]).size,
    ).toBe(0);
    expect(recentFromImports([]).size).toBe(0);
  });
});
