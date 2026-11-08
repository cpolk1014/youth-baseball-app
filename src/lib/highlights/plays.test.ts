import { describe, expect, it } from "vitest";
import {
  callProblem,
  fallbackCall,
  firstName,
  isPlayId,
  markClip,
  momentWindow,
  PLAYS,
  replayWindow,
} from "./plays";

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

describe("markClip", () => {
  it("moves the start and keeps the end when there's room", () => {
    expect(markClip(30, { start: 0, end: 8 }, 3, "start")).toEqual({ start: 3, end: 8 });
  });
  it("pushes the end along when the start passes it", () => {
    expect(markClip(30, { start: 0, end: 8 }, 10, "start")).toEqual({ start: 10, end: 18 });
  });
  it("never runs longer than the max", () => {
    expect(markClip(60, { start: 0, end: 8 }, 40, "end")).toEqual({ start: 25, end: 40 });
    expect(markClip(60, { start: 0, end: 15 }, 0, "start")).toEqual({ start: 0, end: 15 });
  });
  it("stays inside the video", () => {
    expect(markClip(5, { start: 0, end: 5 }, 4.8, "start")).toEqual({ start: 4, end: 5 });
    expect(markClip(5, { start: 2, end: 5 }, 0.2, "end")).toEqual({ start: 0, end: 1 });
  });
});

describe("momentWindow", () => {
  it("centers on the moment", () => {
    expect(momentWindow(0, 10, 5, 2)).toEqual({ from: 4, to: 6 });
  });
  it("slides to stay inside the cut", () => {
    expect(momentWindow(0, 10, 9.5, 4)).toEqual({ from: 6, to: 10 });
    expect(momentWindow(2, 10, 2.1, 4)).toEqual({ from: 2, to: 6 });
  });
  it("is never longer than the cut", () => {
    expect(momentWindow(0, 1.2, 0.6, 4)).toEqual({ from: 0, to: 1.2 });
  });
});
