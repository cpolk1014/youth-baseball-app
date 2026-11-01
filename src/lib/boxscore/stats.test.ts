import { describe, expect, it } from "vitest";
import {
  cleanBatting,
  cleanPitching,
  gameLine,
  inningsToOuts,
  outsToInnings,
  rate,
  seasonTotals,
  type KidGame,
} from "./stats";

const game = (o: Partial<KidGame>): KidGame => ({
  id: "g",
  playerId: "p",
  gameDate: "2026-06-20",
  opponent: "LBC Rudy 13U",
  ourRuns: 4,
  theirRuns: 6,
  teamName: null,
  boxName: null,
  batting: cleanBatting({}),
  pitching: null,
  errors: 0,
  positions: [],
  ...o,
});

describe("cleaning a line", () => {
  it("keeps whole, non-negative numbers and drops junk", () => {
    expect(cleanBatting({ ab: "3", h: 1.4, rbi: -2, so: "x", hr: 500 })).toMatchObject({
      ab: 3,
      h: 1,
      rbi: 0,
      so: 0,
      hr: 99,
      bb: 0,
    });
  });

  it("reads innings pitched in thirds", () => {
    expect(inningsToOuts("3.2")).toBe(11);
    expect(inningsToOuts("1.0")).toBe(3);
    expect(inningsToOuts("0.1")).toBe(1);
    expect(inningsToOuts("2.5")).toBe(0);
    expect(outsToInnings(11)).toBe("3.2");
    expect(
      cleanPitching({ ip: "1.0", h: 2, er: 1, so: 1, pitches: 25, strikes: 15, bf: 6 }),
    ).toMatchObject({
      outs: 3,
      pitches: 25,
    });
  });

  it("treats an empty pitching line as not pitching", () => {
    expect(cleanPitching({ ip: "0", bf: 0 })).toBeNull();
    expect(cleanPitching(null)).toBeNull();
  });
});

describe("seasonTotals", () => {
  const games = [
    game({ batting: cleanBatting({ ab: 3, h: 2, doubles: 1, rbi: 2, bb: 1, so: 1 }) }),
    game({
      ourRuns: 7,
      theirRuns: 2,
      batting: cleanBatting({ ab: 4, h: 1, hr: 1, r: 1, hbp: 1, sf: 1 }),
      pitching: cleanPitching({
        ip: "2.0",
        h: 1,
        er: 1,
        bb: 1,
        so: 3,
        pitches: 30,
        strikes: 20,
        bf: 8,
      }),
      errors: 1,
    }),
  ];
  const t = seasonTotals(games);

  it("adds up the games and the record", () => {
    expect(t).toMatchObject({ games: 2, wins: 1, losses: 1, errors: 1 });
    expect(t.batting).toMatchObject({ ab: 7, h: 3, doubles: 1, hr: 1, singles: 1, tb: 7, pa: 10 });
  });

  it("works out the rates", () => {
    expect(t.batting.avg).toBeCloseTo(3 / 7);
    // (H + BB + HBP) / (AB + BB + HBP + SF) = 5 / 10
    expect(t.batting.obp).toBeCloseTo(0.5);
    expect(t.batting.slg).toBeCloseTo(1);
    expect(t.batting.ops).toBeCloseTo(1.5);
    expect(t.pitching).toMatchObject({ games: 1, outs: 6 });
    expect(t.pitching!.era).toBeCloseTo(3); // 1 ER over 2 innings, per 6
    expect(t.pitching!.whip).toBeCloseTo(1);
    expect(t.pitching!.strikePct).toBeCloseTo(2 / 3);
  });

  it("has no rates without at-bats or innings", () => {
    const empty = seasonTotals([]);
    expect(empty.batting.avg).toBeNull();
    expect(empty.pitching).toBeNull();
    expect(rate(null)).toBe("–");
    expect(rate(0.3333)).toBe(".333");
    expect(rate(1.25)).toBe("1.250");
  });
});

describe("gameLine", () => {
  it("reads like a box score line", () => {
    expect(
      gameLine(game({ batting: cleanBatting({ ab: 3, h: 1, doubles: 1, rbi: 2, bb: 1 }) })),
    ).toBe("1-3, 2B, 2 RBI, BB");
    expect(
      gameLine(
        game({
          batting: cleanBatting({ ab: 2 }),
          pitching: cleanPitching({ ip: "1.0", so: 2, er: 0, bf: 4 }),
        }),
      ),
    ).toBe("0-2, 1.0 IP, 2 K, 0 ER");
  });
});
