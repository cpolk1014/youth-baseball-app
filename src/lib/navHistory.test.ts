import { describe, expect, it } from "vitest";
import { pageName, previousPage, visitPage, type Visit } from "./navHistory";

const go = (stack: Visit[], path: string, title = path) => visitPage(stack, { path, title });

describe("in-app back", () => {
  it("goes back to the page before, and forward again adds to the trail", () => {
    let s: Visit[] = [];
    s = go(s, "/games", "Games");
    s = go(s, "/games/g1", "vs Cubs");
    s = go(s, "/practices", "Practice");
    expect(previousPage(s, "/practices")).toEqual({ path: "/games/g1", title: "vs Cubs" });
    s = go(s, "/games/g1", "vs Cubs"); // tapped Back
    expect(s.map((v) => v.path)).toEqual(["/games", "/games/g1"]);
    expect(previousPage(s, "/games/g1")?.path).toBe("/games");
  });

  it("has nowhere to go from the first page", () => {
    expect(previousPage(go([], "/games"), "/games")).toBeNull();
  });

  it("keeps a late-loading title for the same page", () => {
    const s = go(go([], "/games", ""), "/games", "Games");
    expect(s).toEqual([{ path: "/games", title: "Games" }]);
  });

  it("names pages from their titles", () => {
    expect(pageName("Practice · RallyCap", "/practices/p1")).toBe("Practice");
    expect(pageName("RallyCap", "/my-teams")).toBe("My teams");
    expect(pageName("", "/club?club=1")).toBe("Club");
  });
});
