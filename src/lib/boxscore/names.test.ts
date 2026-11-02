import { describe, expect, it } from "vitest";
import { namesAgree } from "./names";

describe("namesAgree", () => {
  it("matches GameChanger's first initial + last name", () => {
    expect(namesAgree("Oliver Polk", "O Polk")).toBe(true);
    expect(namesAgree("Oliver Polk", "O. Polk")).toBe(true);
    expect(namesAgree("Oliver Polk", "Oliver Polk")).toBe(true);
    expect(namesAgree("Oliver Polk", "Polk, O")).toBe(true);
    expect(namesAgree("John Ryan Chenevert", "J Chenevert")).toBe(true);
  });

  it("matches a roster that uses a last initial", () => {
    expect(namesAgree("Mason R.", "M Robichaux")).toBe(true);
    expect(namesAgree("Mason R.", "M Landry")).toBe(false);
  });

  it("refuses another kid", () => {
    expect(namesAgree("Oliver Polk", "J Jarreau")).toBe(false);
    expect(namesAgree("Oliver Polk", "H Polk")).toBe(false);
    expect(namesAgree("Oliver Polk", "O Price")).toBe(false);
    expect(namesAgree("Oliver Polk", null)).toBe(false);
    expect(namesAgree("Oliver Polk", "Oliver")).toBe(false);
  });

  it("needs a full first name when the roster has only one", () => {
    expect(namesAgree("Jake", "Jake Polk")).toBe(true);
    expect(namesAgree("Jake", "J Polk")).toBe(false);
    expect(namesAgree("Jake", "Luke Polk")).toBe(false);
    expect(namesAgree("Jake", "Josh Polk")).toBe(false);
  });
});
