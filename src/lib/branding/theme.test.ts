import { describe, expect, it } from "vitest";
import { teamColors, themeVars } from "./theme";

describe("team theme", () => {
  it("falls back to RallyCap colors and ignores non-colors", () => {
    expect(teamColors(undefined)).toEqual({ main: "#0b1f3a", accent: "#c8352e" });
    expect(teamColors(["navy", "gold"])).toEqual({ main: "#0b1f3a", accent: "#c8352e" });
  });

  it("keeps dark colors, darkens pale ones, and picks text for the accent", () => {
    expect(themeVars(["#7a1e2c", "#f2b705"])).toMatchObject({
      "--team": "#7a1e2c",
      "--team-accent": "#f2b705",
      "--team-accent-ink": "#000000",
    });
    expect(themeVars(["#f2b705"])["--team"]).not.toBe("#f2b705");
  });
});
