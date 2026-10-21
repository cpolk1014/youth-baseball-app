import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/games/abc")).toBe("/games/abc");
  });

  it("falls back to /games for missing, absolute or protocol-relative targets", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "games",
    ]) {
      expect(safeNextPath(bad)).toBe("/games");
    }
  });
});
