import { describe, expect, it } from "vitest";
import { dollars, isSeasonLabel, nextSeason, seasonEnds, seasonFor, seasonsOnSale } from "./season";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("seasons", () => {
  it("run August 1 to July 31", () => {
    expect(seasonFor(d("2026-08-01"))).toBe("2026-27");
    expect(seasonFor(d("2026-12-15"))).toBe("2026-27");
    expect(seasonFor(d("2027-07-31"))).toBe("2026-27");
    expect(seasonFor(d("2027-08-01"))).toBe("2027-28");
    expect(seasonFor(d("2099-09-01"))).toBe("2099-00");
    expect(seasonEnds("2026-27")).toBe("2027-07-31");
    expect(nextSeason("2026-27")).toBe("2027-28");
  });

  it("put next season on sale from June", () => {
    expect(seasonsOnSale(d("2026-12-15"))).toEqual(["2026-27"]);
    expect(seasonsOnSale(d("2027-06-01"))).toEqual(["2026-27", "2027-28"]);
    expect(seasonsOnSale(d("2027-07-31"))).toEqual(["2026-27", "2027-28"]);
    expect(seasonsOnSale(d("2027-08-01"))).toEqual(["2027-28"]);
  });

  it("check season labels and format money", () => {
    expect(isSeasonLabel("2026-27")).toBe(true);
    expect(isSeasonLabel("2026-28")).toBe(false);
    expect(isSeasonLabel("26-27")).toBe(false);
    expect(dollars(9900 * 26)).toBe("$2,574");
    expect(dollars(12900)).toBe("$129");
  });
});

describe("player stats prices", () => {
  it("is $10 for the first kid and $5 for each one after", async () => {
    const { statsPriceCents, validKids } = await import("./family");
    expect([1, 2, 3, 4].map(statsPriceCents)).toEqual([1000, 1500, 2000, 2500]);
    expect(statsPriceCents(0)).toBe(0);
    expect(validKids(3)).toBe(true);
    expect(validKids(0)).toBe(false);
    expect(validKids(11)).toBe(false);
    expect(validKids(1.5)).toBe(false);
  });
});
