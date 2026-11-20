import { describe, expect, it } from "vitest";
import {
  CLUB_PRICE_CENTS,
  dollars,
  isSeasonLabel,
  nextSeason,
  quote,
  seasonEnds,
  seasonFor,
  seasonsOnSale,
  springStarts,
  teamQuote,
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

  it("charge teams the full season through December, then the spring price", () => {
    expect(teamQuote("2026-27", d("2026-08-01"))).toMatchObject({ cents: 12900, spring: false });
    expect(teamQuote("2026-27", d("2026-11-16"))).toMatchObject({ cents: 12900, spring: false });
    expect(teamQuote("2026-27", d("2026-12-31"))).toMatchObject({ cents: 12900, spring: false });
    expect(teamQuote("2026-27", d("2027-01-01"))).toMatchObject({
      cents: 8900,
      fullCents: 12900,
      spring: true,
      ends: "2027-07-31",
    });
    expect(teamQuote("2026-27", d("2027-05-31")).cents).toBe(8900);
    expect(springStarts("2026-27")).toBe("2027-01-01");
  });

  it("charge clubs and the Player pass one price all season", () => {
    for (const day of ["2026-08-01", "2026-11-16", "2027-02-01", "2027-05-31"]) {
      expect(quote(CLUB_PRICE_CENTS, "2026-27", d(day))).toMatchObject({
        cents: 9900,
        spring: false,
      });
      expect(quote(1500, "2026-27", d(day)).cents).toBe(1500);
    }
  });

  it("charge next season in full, with the rest of this one free", () => {
    // June 15: next season isn't spring yet, so even a team pays the full price.
    expect(teamQuote("2027-28", d("2027-06-15"))).toMatchObject({
      cents: 12900,
      spring: false,
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
