import { describe, expect, it } from "vitest";
import { isGuest } from "./guest";

describe("isGuest", () => {
  it("is true only for an anonymous sign-in", () => {
    expect(isGuest({ is_anonymous: true })).toBe(true);
    expect(isGuest({ is_anonymous: false })).toBe(false);
    expect(isGuest({})).toBe(false);
    expect(isGuest(null)).toBe(false);
  });
});
