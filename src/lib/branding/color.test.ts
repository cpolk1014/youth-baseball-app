import { describe, expect, it } from "vitest";
import {
  contrast,
  extractPalette,
  hexToRgb,
  inkFor,
  isHex,
  readableOnWhite,
  rgbToHex,
  suggestPair,
} from "./color";

const solid = (hex: string, n: number, alpha = 255) => {
  const [r, g, b] = hexToRgb(hex)!;
  return Array.from({ length: n }, () => [r, g, b, alpha]).flat();
};

describe("colors", () => {
  it("converts hex and checks it", () => {
    expect(hexToRgb("#c8352e")).toEqual([200, 53, 46]);
    expect(rgbToHex([200, 53, 46])).toBe("#c8352e");
    expect(isHex("#ABCDEF")).toBe(true);
    expect(isHex("red")).toBe(false);
  });

  it("picks black or white text for readability", () => {
    expect(inkFor("#0b1f3a")).toBe("#ffffff");
    expect(inkFor("#f2b705")).toBe("#000000");
    expect(inkFor("#ffffff")).toBe("#000000");
  });

  it("darkens pale colors until white text reads, and leaves dark ones alone", () => {
    expect(readableOnWhite("#0b1f3a")).toBe("#0b1f3a");
    const gold = readableOnWhite("#f2b705");
    expect(contrast(hexToRgb(gold)!, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(gold).not.toBe("#f2b705");
  });
});

describe("palette from a picture", () => {
  it("finds the team colors and ranks them ahead of a white background", () => {
    // Mostly white background, then navy, then a bit of red.
    const pixels = [...solid("#ffffff", 600), ...solid("#0b1f3a", 250), ...solid("#c8352e", 150)];
    const palette = extractPalette(pixels);
    expect(palette.slice(0, 2)).toEqual(["#0b1f3a", "#c8352e"]);
    expect(palette).toContain("#ffffff");
  });

  it("skips transparent pixels and groups near-identical shades", () => {
    const pixels = [
      ...solid("#000000", 500, 0), // transparent
      ...solid("#c8352e", 100),
      ...solid("#c9362f", 100), // same red, a hair off
      ...solid("#15803d", 80),
    ];
    const palette = extractPalette(pixels);
    expect(palette).toHaveLength(2);
    expect(palette[1]).toBe("#15803d");
  });

  it("returns nothing for an empty or fully transparent picture", () => {
    expect(extractPalette([])).toEqual([]);
    expect(extractPalette(solid("#ff0000", 10, 0))).toEqual([]);
  });

  it("suggests the two real colors, not the white background", () => {
    expect(suggestPair(["#7a1e2c", "#ffffff", "#f2b705"])).toEqual({
      main: "#7a1e2c",
      accent: "#f2b705",
    });
    expect(suggestPair(["#ffffff", "#111111"])).toEqual({ main: "#ffffff", accent: "#111111" });
    expect(suggestPair(["#15803d", "#ffffff"])).toEqual({ main: "#15803d", accent: "#ffffff" });
    expect(suggestPair([])).toBeNull();
  });
});
