import { describe, expect, it } from "vitest";
import { TIP_MAX, TIPS, tipAt, tipsFor } from "./tips";

describe("loading tips", () => {
  it("are short enough to read in a few seconds", () => {
    for (const t of TIPS) expect(t.text.length, t.text).toBeLessThanOrEqual(TIP_MAX);
  });

  it("are all different", () => {
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(TIPS.length);
  });

  it("show coaches the coach tips and families the family tips", () => {
    const coach = tipsFor("coach");
    const parent = tipsFor("parent");
    expect(coach.some((t) => t.includes("pitching change"))).toBe(true);
    expect(coach.some((t) => t.includes("Parents channel"))).toBe(false);
    expect(parent.some((t) => t.includes("Parents channel"))).toBe(true);
    expect(parent.some((t) => t.includes("box score"))).toBe(false);
    expect(tipsFor("owner")).toEqual(coach);
    expect(tipsFor("treasurer")).toEqual(parent);
  });

  it("shows only the tips for everyone before the role is known", () => {
    const anyone = tipsFor(undefined);
    expect(anyone.length).toBeGreaterThan(5);
    expect(anyone.every((t) => TIPS.find((x) => x.text === t)?.for === "all")).toBe(true);
  });

  it("goes round the list", () => {
    const tips = ["a", "b", "c"];
    expect(tipAt(tips, 2, 0)).toBe("c");
    expect(tipAt(tips, 2, 1)).toBe("a");
    expect(tipAt(tips, 0, 7)).toBe("b");
    expect(tipAt([], 0, 0)).toBe("");
  });
});
