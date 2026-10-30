import { describe, expect, it } from "vitest";
import { limitProblem, waitText } from "./limits";

describe("limitProblem", () => {
  it("allows clips under the limits and stops them at the limit", () => {
    const family = { staff: false };
    expect(limitProblem("song", { mine: 0, team: 0 }, family)).toBeNull();
    expect(limitProblem("song", { mine: 15, team: 15 }, family)).toMatch(/You've made 15 songs/);
    expect(limitProblem("song", { mine: 2, team: 120 }, family)).toMatch(/team has made 120 songs/);
  });

  it("gives coaches and managers more songs than families", () => {
    expect(limitProblem("song", { mine: 15, team: 15 }, { staff: true })).toBeNull();
    expect(limitProblem("song", { mine: 40, team: 40 }, { staff: true })).toMatch(/made 40 songs/);
  });

  it("says when the next one frees up", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    const oldest = "2026-10-29T15:00:00Z"; // drops off at 15:00 today
    expect(
      limitProblem("song", { mine: 15, team: 15 }, { staff: false, oldestMine: oldest, now }),
    ).toMatch(/make another in about 3 hours/);
  });
});

describe("waitText", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  it("rounds to hours, or minutes when under an hour", () => {
    expect(waitText("2026-10-29T12:20:00Z", now)).toBe("about 20 minutes");
    expect(waitText("2026-10-29T13:00:00Z", now)).toBe("about 1 hour");
    expect(waitText(null, now)).toBeNull();
    expect(waitText("2026-10-29T11:00:00Z", now)).toBeNull();
  });
});
