import { describe, expect, it } from "vitest";
import { callProblem, fallbackCall, firstName, isPlayId, PLAYS, replayWindow } from "./plays";

describe("plays", () => {
  it("knows its plays", () => {
    expect(isPlayId("home_run")).toBe(true);
    expect(isPlayId("bunt")).toBe(false);
    expect(new Set(PLAYS.map((p) => p.id)).size).toBe(PLAYS.length);
  });

  it("calls the kid by first name and number in words", () => {
    expect(fallbackCall("home_run", "Mason Reed", 7)).toBe(
      "number seven... Mason turns on it... deep to left... that ball is GONE!",
    );
    expect(fallbackCall("hit", "Leo", null)).toBe(
      "Leo lines a base hit into the outfield! What a swing!",
    );
  });

  it("has a call for every play, and none says he or she", () => {
    for (const p of PLAYS) {
      const call = fallbackCall(p.id, "Sam P.", 17);
      expect(call).toContain("Sam");
      expect(call).not.toMatch(/\b(he|she)\b/i);
    }
  });

  it("takes first names", () => {
    expect(firstName("  Mason R. ")).toBe("Mason");
  });

  it("checks what the announcer says", () => {
    expect(callProblem("  ")).toMatch(/Write/);
    expect(callProblem("x".repeat(201))).toMatch(/under 200/);
    expect(callProblem("see www.example.com")).toMatch(/links/);
    expect(callProblem("Mason with a double!")).toBeNull();
  });
});

describe("replayWindow", () => {
  it("replays the last 3 seconds by default", () => {
    expect(replayWindow(2, 10)).toEqual({ from: 7, to: 10 });
    expect(replayWindow(0, 2)).toEqual({ from: 0, to: 2 });
  });
  it("uses the parent's pick", () => {
    expect(replayWindow(2, 10, { from: 4, to: 5.5 })).toEqual({ from: 4, to: 5.5 });
  });
  it("keeps the pick inside the clip", () => {
    expect(replayWindow(2, 10, { from: 0, to: 1 })).toEqual({ from: 2, to: 3 });
    expect(replayWindow(2, 10, { from: 9.8, to: 12 })).toEqual({ from: 9.5, to: 10 });
  });
  it("is at least half a second and at most 5", () => {
    expect(replayWindow(0, 10, { from: 3, to: 3.1 })).toEqual({ from: 3, to: 3.5 });
    expect(replayWindow(0, 10, { from: 1, to: 9 })).toEqual({ from: 1, to: 6 });
  });
});
