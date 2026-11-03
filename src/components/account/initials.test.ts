import { describe, expect, it } from "vitest";
import { initials } from "./useMe";

describe("initials", () => {
  it("uses first and last name, else the email, else ?", () => {
    expect(initials({ name: "Craig Polk", email: null })).toBe("CP");
    expect(initials({ name: "John Ryan Chenevert", email: null })).toBe("JC");
    expect(initials({ name: "Jake", email: null })).toBe("J");
    expect(initials({ name: null, email: "craig@example.com" })).toBe("C");
    expect(initials(null)).toBe("?");
  });
});
