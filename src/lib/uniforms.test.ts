import { describe, expect, it } from "vitest";
import {
  cleanFlyerCombos,
  cleanPieces,
  colorHex,
  describeUniform,
  gameUniformShown,
  uniformProblem,
  type UniformCombo,
} from "./uniforms";

const dark: UniformCombo = {
  id: "dark",
  name: "Dark combo",
  shirt: "Black",
  pants: "Black",
  hat: "Red",
  belt: "Red",
  socks: "Red",
};

describe("colorHex", () => {
  it("uses the first color named, with common aliases", () => {
    expect(colorHex("White, red sleeves")).toBe("#ffffff");
    expect(colorHex("Black with red piping")).toBe("#111111");
    expect(colorHex("grey")).toBe("#9ca3af");
    expect(colorHex("Navy blue")).toBe("#1f2a44");
    expect(colorHex("light blue")).toBe("#9bcbeb");
    expect(colorHex("Camo")).toBeNull();
    expect(colorHex(null)).toBeNull();
  });
});

describe("pieces", () => {
  it("trims and blanks out empty pieces", () => {
    expect(cleanPieces({ shirt: "  Black  ", pants: "", hat: 3 })).toEqual({
      shirt: "Black",
      pants: null,
      hat: null,
      belt: null,
      socks: null,
    });
  });

  it("needs a name (for saved combos) and at least one piece", () => {
    const none = cleanPieces({});
    expect(uniformProblem("Dark", none)).toMatch(/at least one/);
    expect(uniformProblem(" ", cleanPieces({ shirt: "Black" }))).toMatch(/name/);
    expect(uniformProblem(null, cleanPieces({ shirt: "Black" }))).toBeNull();
  });

  it("describes a uniform in one line", () => {
    expect(describeUniform(dark)).toBe(
      "Black shirt · Black pants · Red hat · Red belt · Red socks",
    );
    expect(describeUniform(cleanPieces({ shirt: "White", hat: "Red" }))).toBe(
      "White shirt · Red hat",
    );
  });
});

describe("gameUniformShown", () => {
  it("shows a saved combo, a game's own pieces, or nothing", () => {
    expect(gameUniformShown({ comboId: "dark" }, [dark])?.name).toBe("Dark combo");
    expect(gameUniformShown({ comboId: "gone" }, [dark])).toBeNull();
    const custom = cleanPieces({ shirt: "Gray" });
    expect(gameUniformShown({ custom }, [dark])).toEqual({ name: null, pieces: custom });
    expect(gameUniformShown(null, [dark])).toBeNull();
  });
});

describe("cleanFlyerCombos", () => {
  it("keeps combos with pieces, names unnamed ones, and caps the list", () => {
    const raw = {
      combos: [
        { name: "Home whites", shirt: "White, red sleeves", pants: "White", socks: null },
        { name: "", shirt: "Black" },
        { name: "Empty" },
        ...Array.from({ length: 20 }, () => ({ name: "X", hat: "Red" })),
      ],
    };
    const combos = cleanFlyerCombos(raw);
    expect(combos[0]).toMatchObject({
      name: "Home whites",
      shirt: "White, red sleeves",
      socks: null,
    });
    expect(combos[1]?.name).toBe("Combo 2");
    expect(combos.some((c) => c.name === "Empty")).toBe(false);
    expect(combos).toHaveLength(12);
    expect(cleanFlyerCombos({ nope: 1 })).toEqual([]);
  });
});
