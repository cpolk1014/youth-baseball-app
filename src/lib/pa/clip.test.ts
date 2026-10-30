import { describe, expect, it } from "vitest";
import {
  clampClip,
  defaultClip,
  encodeWav,
  formatTime,
  normalizeGain,
  parseTime,
  walkupTimeline,
} from "./clip";

describe("clampClip", () => {
  it("keeps the slice inside the song", () => {
    expect(clampClip({ start: -2, end: 10 }, 180)).toEqual({ start: 0, end: 10 });
    expect(clampClip({ start: 175, end: 190 }, 180)).toEqual({ start: 175, end: 180 });
  });
  it("caps the length at 20 seconds and floors it at 3", () => {
    expect(clampClip({ start: 30, end: 80 }, 180)).toEqual({ start: 30, end: 50 });
    expect(clampClip({ start: 30, end: 31 }, 180)).toEqual({ start: 30, end: 33 });
    expect(clampClip({ start: 179, end: 179 }, 180)).toEqual({ start: 177, end: 180 });
  });
  it("handles songs shorter than the minimum", () => {
    expect(clampClip({ start: 0, end: 10 }, 2)).toEqual({ start: 0, end: 2 });
  });
  it("offers the first 15 seconds of a new song", () => {
    expect(defaultClip(200)).toEqual({ start: 0, end: 15 });
    expect(defaultClip(12)).toEqual({ start: 0, end: 12 });
  });
});

describe("times", () => {
  it("formats and parses", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.5)).toBe("1:05.5");
    expect(formatTime(59.97)).toBe("1:00");
    expect(parseTime("1:05")).toBe(65);
    expect(parseTime("65")).toBe(65);
    expect(parseTime("0:45.5")).toBe(45.5);
    expect(parseTime("abc")).toBeNull();
  });
});

describe("walkupTimeline", () => {
  it("puts the announcer over the intro with the music dipped", () => {
    const t = walkupTimeline("over", 15, 3);
    expect(t.songAt).toBe(0);
    expect(t.announceAt).toBe(0.8);
    expect(t.duck!.from).toBeCloseTo(0.5);
    expect(t.duck!.to).toBeCloseTo(4);
    expect(t.total).toBe(15);
  });
  it("plays the announcer first when asked", () => {
    const t = walkupTimeline("before", 15, 3);
    expect(t).toMatchObject({ announceAt: 0, duck: null });
    expect(t.songAt).toBeCloseTo(3.3);
    expect(t.total).toBeCloseTo(18.3);
  });
  it("plays just the song with no announcer", () => {
    expect(walkupTimeline("over", 12, null)).toEqual({
      songAt: 0,
      announceAt: null,
      duck: null,
      total: 12,
    });
  });
});

describe("normalizeGain", () => {
  it("raises quiet clips and lowers clipping ones, within reason", () => {
    expect(normalizeGain(0.5)).toBeCloseTo(1.78);
    expect(normalizeGain(1)).toBeCloseTo(0.89);
    expect(normalizeGain(0.01)).toBe(8);
    expect(normalizeGain(0)).toBe(1);
  });
});

describe("encodeWav", () => {
  it("writes a valid 16-bit mono header and samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 32000);
    const v = new DataView(wav);
    const tag = (at: number) => String.fromCharCode(...new Uint8Array(wav, at, 4));
    expect(wav.byteLength).toBe(44 + 8);
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(v.getUint32(24, true)).toBe(32000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(32767); // clipped
  });
});
