import { describe, expect, it } from "vitest";
import { BUILT_IN_SOUNDS, noteFrequency, tuneEvents } from "./sounds";

describe("noteFrequency", () => {
  it("knows its notes", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440);
    expect(noteFrequency("C4")).toBeCloseTo(261.63, 1);
    expect(noteFrequency("C#5")).toBeCloseTo(554.37, 1);
    expect(noteFrequency("Bb3")).toBeCloseTo(233.08, 1);
    expect(noteFrequency("H2")).toBeNull();
  });
});

describe("built-in sounds", () => {
  it("have unique ids and every tune parses", () => {
    const ids = BUILT_IN_SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of BUILT_IN_SOUNDS) {
      if (!s.tune) continue;
      const { events, seconds } = tuneEvents(s.tune);
      expect(events.length, s.id).toBeGreaterThan(3);
      expect(seconds, s.id).toBeGreaterThan(1);
      expect(seconds, s.id).toBeLessThan(30);
    }
  });

  it("covers every category", () => {
    for (const c of ["pregame", "organ", "mound", "quick"]) {
      expect(BUILT_IN_SOUNDS.some((s) => s.category === c)).toBe(true);
    }
  });

  it("times notes from the tempo", () => {
    const { events, chordAt } = tuneEvents({ bpm: 120, notes: "C4:1 -:1 clap:0.5" });
    expect(events).toEqual([
      { at: 0, seconds: 0.5, sound: expect.closeTo(261.63, 1) },
      { at: 1, seconds: 0.25, sound: "clap" },
    ]);
    expect(chordAt).toBe(1.25);
    expect(() => tuneEvents({ bpm: 120, notes: "Q4:1" })).toThrow(/Bad note/);
  });
});
