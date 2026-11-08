import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import { searchResults } from "./CommandPalette";

describe("search pages", () => {
  it("has no team pages when signed in without a team (a club-only account)", () => {
    const labels = searchResults(null, true, "").map((r) => r.label);
    expect(labels).toEqual(["My profile", "My teams"]);
  });
  it("lists the team's pages when there is a team", () => {
    const labels = searchResults(SEED_DATA, true, "").map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["Home", "Games", "Roster", "My teams"]));
  });
});
