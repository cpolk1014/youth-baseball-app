import { describe, expect, it } from "vitest";
import { audienceLine, saveMeLines } from "./saveMe";

describe("Save me from myself", () => {
  it("gives the same post the same lines every time", () => {
    expect(saveMeLines("Great game today!")).toEqual(saveMeLines("Great game today!"));
    expect(saveMeLines("").headline).toBeTruthy();
    expect(saveMeLines("").nudge).toBeTruthy();
  });

  it("varies the lines across posts", () => {
    const heads = new Set(
      ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "Who's got snacks?"].map(
        (b) => saveMeLines(b).headline,
      ),
    );
    expect(heads.size).toBeGreaterThan(1);
  });

  it("gives coaches their own lines, never the ones about Coach", () => {
    const posts = ["a", "bb", "ccc", "Great win today", "Practice moved to 6", "Bring water"];
    for (const b of posts) {
      expect(saveMeLines(b, true).nudge).not.toMatch(/Coach standing/);
    }
    const nudges = new Set(posts.map((b) => saveMeLines(b, true).nudge));
    expect(
      [...nudges].some((n) =>
        /parent's face at pickup|grandparents|dinner|party|Hot takes/.test(n),
      ),
    ).toBe(true);
    expect(saveMeLines("x", true)).toEqual(saveMeLines("x", true));
  });

  it("says who reads each channel", () => {
    expect(audienceLine("families", "10U Canes").who).toMatch(/No coaches/);
    expect(audienceLine("parents", "10U Canes").who).toBe(
      "Coaches, managers and every family on 10U Canes. Yes, Coach too.",
    );
    expect(audienceLine("team", "10U Canes").who).toMatch(/club's director/);
    expect(audienceLine("coach", "Traction Canes").label).toBe("📋 Coach Chatter");
  });
});
