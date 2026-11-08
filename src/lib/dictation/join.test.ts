import { describe, expect, it } from "vitest";
import { insertDictation, joinDictation } from "./join";

describe("joinDictation", () => {
  it("fills an empty box with a capital letter", () => {
    expect(joinDictation("", "owen never pitches")).toBe("Owen never pitches");
  });
  it("adds to the end with a space", () => {
    expect(joinDictation("No kid catches", "more than two innings")).toBe(
      "No kid catches more than two innings",
    );
  });
  it("capitalizes after the end of a sentence", () => {
    expect(joinDictation("Work on bunting.", "more cutoffs")).toBe("Work on bunting. More cutoffs");
  });
  it("starts a new line without a space", () => {
    expect(joinDictation("Step up to the plate\n", "bring the heat")).toBe(
      "Step up to the plate\nBring the heat",
    );
  });
  it("tidies spaces and ignores silence", () => {
    expect(joinDictation("Hi  ", "   ")).toBe("Hi  ");
    expect(joinDictation("Hi  ", "  there   friend ")).toBe("Hi there friend");
  });
  it("keeps to the box's limit", () => {
    expect(joinDictation("abc", "defghij", 8)).toBe("abc defg");
  });
});

describe("insertDictation", () => {
  it("replaces the selected text", () => {
    const v = "Work on bunting. Old goals here.";
    expect(insertDictation(v, 0, v.length, "focus on throwing")).toEqual({
      text: "Focus on throwing",
      caret: 17,
    });
  });
  it("goes in at the caret, with spaces on both sides", () => {
    expect(insertDictation("Bunting and throwing.", 8, 8, "base running")).toEqual({
      text: "Bunting base running and throwing.",
      caret: 20,
    });
  });
  it("adds at the end when the caret is at the end", () => {
    expect(insertDictation("Bunting.", 8, 8, "more reps").text).toBe("Bunting. More reps");
  });
  it("leaves no space before punctuation and keeps to the limit", () => {
    expect(insertDictation("Bunting.", 7, 7, "drills").text).toBe("Bunting drills.");
    expect(insertDictation("abc", 3, 3, "defghij", 8).text).toBe("abc defg");
  });
});
