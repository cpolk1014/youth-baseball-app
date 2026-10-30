import { describe, expect, it } from "vitest";
import { limitProblem } from "./limits";

describe("limitProblem", () => {
  it("allows clips under the limits and stops them at the limit", () => {
    expect(limitProblem("song", { mine: 0, team: 0 })).toBeNull();
    expect(limitProblem("song", { mine: 15, team: 15 })).toMatch(/You've made 15 songs/);
    expect(limitProblem("song", { mine: 2, team: 60 })).toMatch(/team has made 60 songs/);
  });
});
