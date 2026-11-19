import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/games/abc")).toBe("/games/abc");
  });

  it("keeps query strings and club sign-ups", () => {
    expect(safeNextPath("/club")).toBe("/club");
    expect(safeNextPath("/my-player?player=abc#stats")).toBe("/my-player?player=abc#stats");
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
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r//evil.com",
      "/\\/evil.com",
    ]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
