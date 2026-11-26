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

  it("says who reads each channel", () => {
    expect(audienceLine("families", "10U Canes").who).toMatch(/No coaches/);
    expect(audienceLine("parents", "10U Canes").who).toBe(
      "Coaches, managers and every family on 10U Canes. Yes, Coach too.",
    );
    expect(audienceLine("team", "10U Canes").who).toMatch(/club's director/);
    expect(audienceLine("coach", "Traction Canes").label).toBe("📋 Coach Chatter");
  });
});
