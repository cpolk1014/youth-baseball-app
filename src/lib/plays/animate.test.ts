import { describe, expect, it } from "vitest";
import { actorsIn, keysFor, playDuration, positionAt, stepAt } from "./animate";
import { START } from "./field";
import type { Play } from "./types";

const play: Play = {
  id: "t",
  name: "Test",
  category: "Ground balls",
  situation: "Nobody on",
  runners: ["R1"],
  ball: [
    [0, 200, 365],
    [1, 170, 250],
  ],
  moves: {
    SS: [[1, 172, 250]],
    B: [
      [0.3, 210, 368],
      [2.3, 270, 300],
    ],
  },
  steps: [
    [0, "Hit"],
    [1, "Fielded"],
  ],
  jobs: {},
};

describe("play animation", () => {
  it("lists fielders, the batter and runners on base", () => {
    expect(actorsIn(play)).toEqual(["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "B", "R1"]);
  });

  it("starts every actor at their spot and keeps still actors there", () => {
    expect(keysFor(play, "SS")[0]).toEqual([0, ...START.SS]);
    expect(keysFor(play, "CF")).toEqual([[0, ...START.CF]]);
  });

  it("interpolates between keyframes and holds at the ends", () => {
    const keys = keysFor(play, "SS"); // (168,240) → (172,250) over 1s
    expect(positionAt(keys, 0.5)).toEqual([170, 245]);
    expect(positionAt(keys, 5)).toEqual([172, 250]);
    expect(positionAt(keys, -1)).toEqual([168, 240]);
  });

  it("runs until the last movement plus a beat, and tracks the current step", () => {
    expect(playDuration(play)).toBeCloseTo(3.2);
    expect(stepAt(play, 0.5)).toBe(0);
    expect(stepAt(play, 1.5)).toBe(1);
  });
});
