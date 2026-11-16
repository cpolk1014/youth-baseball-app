import { describe, expect, it } from "vitest";
import {
  dollars,
  isSeasonLabel,
  nextSeason,
  quote,
  seasonEnds,
  seasonFor,
  seasonsOnSale,
} from "./season";

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

  it("sell only next season from June (the rest of this one comes with it)", () => {
    expect(seasonsOnSale(d("2026-12-15"))).toEqual(["2026-27"]);
    expect(seasonsOnSale(d("2027-05-31"))).toEqual(["2026-27"]);
    expect(seasonsOnSale(d("2027-06-01"))).toEqual(["2027-28"]);
    expect(seasonsOnSale(d("2027-07-31"))).toEqual(["2027-28"]);
    expect(seasonsOnSale(d("2027-08-01"))).toEqual(["2027-28"]);
  });

  it("prorate by the days left, in whole dollars, never under a quarter", () => {
    // August 1: the whole season.
    expect(quote(12900, "2026-27", d("2026-08-01"))).toMatchObject({
      cents: 12900,
      daysLeft: 365,
      seasonDays: 365,
      floor: false,
    });
    // November 16: 258 of 365 days left (counting today), 129 × 258 / 365 = 91.19, so $91.
    expect(quote(12900, "2026-27", d("2026-11-16"))).toMatchObject({ cents: 9100, daysLeft: 258 });
    expect(quote(9900, "2026-27", d("2026-11-16")).cents).toBe(7000);
    expect(quote(1000, "2026-27", d("2026-11-16")).cents).toBe(700);
    // May 20: 73 days left would be $26, but a quarter of $129 rounds up to $33.
    expect(quote(12900, "2026-27", d("2027-05-20"))).toMatchObject({
      cents: 3300,
      daysLeft: 73,
      floor: true,
    });
    expect(quote(1000, "2026-27", d("2027-05-31")).cents).toBe(300);
    // A leap year has 366 days.
    expect(quote(12900, "2027-28", d("2027-08-01")).seasonDays).toBe(366);
  });

  it("charge next season in full, with the rest of this one free", () => {
    expect(quote(12900, "2027-28", d("2027-06-15"))).toMatchObject({
      cents: 12900,
      bonusDays: 47,
      ends: "2028-07-31",
    });
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
