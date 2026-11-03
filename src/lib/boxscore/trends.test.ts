import { describe, expect, it } from "vitest";
import { cleanBatting, cleanPitching, seasonTotals, type KidGame } from "./stats";
import { battingTrend, pitchingTrend, playerCardFileName, playerCardModel } from "./trends";

const game = (
  id: string,
  date: string,
  batting: Record<string, number>,
  pitching: Record<string, number> | null = null,
): KidGame => ({
  id,
  playerId: "kid",
  gameDate: date,
  opponent: `Team ${id}`,
  ourRuns: null,
  theirRuns: null,
  teamName: null,
  boxName: null,
  batting: cleanBatting(batting),
  pitching: pitching ? cleanPitching(pitching) : null,
  errors: 0,
  positions: [],
});

const games = [
  game("b", "2026-09-08", { ab: 4, h: 1 }),
  game(
    "a",
    "2026-09-01",
    { ab: 3, h: 2, bb: 1, doubles: 1 },
    { outs: 6, pitches: 40, strikes: 26, so: 3 },
  ),
  game("c", "2026-09-15", { ab: 3, h: 0 }, { outs: 3, pitches: 0, strikes: 0, so: 1 }),
];

describe("battingTrend", () => {
  it("gives season-to-date rates after each game, oldest first", () => {
    const t = battingTrend(games);
    expect(t.map((p) => p.gameId)).toEqual(["a", "b", "c"]);
    expect(t[0]!.avg).toBeCloseTo(2 / 3);
    expect(t[1]!.avg).toBeCloseTo(3 / 7);
    expect(t[2]!.avg).toBeCloseTo(3 / 10);
    expect(t[0]!.obp).toBeCloseTo(3 / 4);
    expect([t[1]!.hits, t[1]!.atBats]).toEqual([1, 4]);
  });
});

describe("pitchingTrend", () => {
  it("lists only games they pitched, with that game's strike share", () => {
    const p = pitchingTrend(games);
    expect(p.map((x) => x.gameId)).toEqual(["a", "c"]);
    expect(p[0]!.strikePct).toBeCloseTo(0.65);
    expect(p[1]!.strikePct).toBeNull();
  });
});

describe("playerCardModel", () => {
  it("shows the kid's rates, non-zero counts and a pitching line", () => {
    const m = playerCardModel({
      name: "Leo T.",
      jersey: 5,
      teamName: "Rattlers",
      season: "Fall 2026",
      totals: seasonTotals(games),
    });
    expect(m.jersey).toBe("#5");
    expect(m.rates.map((r) => r.value)).toEqual([".300", ".364", ".400", ".764"]);
    expect(m.counts).toEqual([
      { label: "H", value: "3" },
      { label: "2B", value: "1" },
      { label: "BB", value: "1" },
    ]);
    expect(m.pitching).toBe("3.0 IP · 0.00 ERA · 4 K · 65% strikes");
    expect(playerCardFileName("Leo T.", "Fall 2026")).toBe("leo-t-fall-2026.png");
  });
});
