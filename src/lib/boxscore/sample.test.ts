import { describe, expect, it } from "vitest";
import { sampleCareer } from "./sample";
import { seasonTotals } from "./stats";
import { inYears, yearsOf } from "./years";

describe("the sample career", () => {
  it("is three seasons of a player getting better, the same every time", () => {
    const games = sampleCareer(2027);
    expect(yearsOf(games)).toEqual([2027, 2026, 2025]);
    const avg = (y: number) => seasonTotals(inYears(games, [y])).batting.avg ?? 0;
    expect(avg(2025)).toBeLessThan(avg(2027));
    expect(seasonTotals(games).pitching).not.toBeNull();
    expect(sampleCareer(2027)).toEqual(games);
  });
});
