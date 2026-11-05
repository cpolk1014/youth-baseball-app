import { describe, expect, it } from "vitest";
import { defaultYears, inYears, toggleYear, yearsLabel, yearsOf } from "./years";

const games = ["2025-06-20", "2027-02-15", "2025-07-01", "2026-03-10"].map((gameDate) => ({
  gameDate,
}));

describe("stats by year", () => {
  it("lists the years with games, newest first, and opens on this year", () => {
    const years = yearsOf(games);
    expect(years).toEqual([2027, 2026, 2025]);
    expect(defaultYears(years, 2026)).toEqual([2026]);
    expect(defaultYears(years, 2030)).toEqual([2027]);
    // One year only: no picking needed.
    expect(defaultYears([2027], 2027)).toBe("all");
  });

  it("picks any mix of years, or all of them", () => {
    let pick = toggleYear("all", 2025);
    expect(pick).toEqual([2025]);
    pick = toggleYear(pick, 2027);
    expect(pick).toEqual([2025, 2027]);
    expect(inYears(games, pick).map((g) => g.gameDate)).toEqual([
      "2025-06-20",
      "2027-02-15",
      "2025-07-01",
    ]);
    expect(yearsLabel(pick)).toBe("2025 and 2027");
    // Never down to none.
    expect(toggleYear([2025], 2025)).toEqual([2025]);
    // From 2026 to 2025 and 2027, one tap at a time (every year on the way stays a list).
    let p2 = toggleYear([2026], 2025);
    p2 = toggleYear(p2, 2027);
    expect(p2).toEqual([2025, 2026, 2027]);
    expect(toggleYear(p2, 2026)).toEqual([2025, 2027]);
    expect(yearsLabel("all")).toBe("all years");
    expect(yearsLabel([2027, 2024, 2025])).toBe("2024, 2025 and 2027");
  });
});
