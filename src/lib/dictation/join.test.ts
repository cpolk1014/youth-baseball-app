import { describe, expect, it } from "vitest";
import { joinDictation } from "./join";

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
