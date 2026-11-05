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

describe("family add-on prices", () => {
  it("has the six plans at their prices, with codes to share", async () => {
    const { FAMILY_OPTIONS, FAMILY_FROM_CENTS, familyOption } = await import("./family");
    expect(FAMILY_OPTIONS.map((o) => [o.scope, o.plan, o.cents, o.shares])).toEqual([
      ["one", "solo", 1000, 0],
      ["one", "partner", 1500, 1],
      ["one", "blended", 3000, 3],
      ["multi", "solo", 1500, 0],
      ["multi", "partner", 2000, 1],
      ["multi", "blended", 4000, 3],
    ]);
    expect(FAMILY_FROM_CENTS).toBe(1000);
    expect(familyOption("partner", "multi")?.cents).toBe(2000);
    expect(familyOption("gold", "multi")).toBeNull();
  });
});
