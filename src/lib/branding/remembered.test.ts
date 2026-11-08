import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetLook, LOOK_KEY, LOOK_SCRIPT, rememberLook } from "./remembered";

// Small stand-ins for the browser's storage and <html> style (no DOM library needed).
let store: Map<string, string>;
let style: Map<string, string>;
const runScript = () => new Function(LOOK_SCRIPT)();

beforeEach(() => {
  store = new Map();
  style = new Map();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const document = {
    documentElement: { style: { setProperty: (k: string, v: string) => void style.set(k, v) } },
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("document", document);
});
afterEach(() => vi.unstubAllGlobals());

describe("remembered team colors", () => {
  it("saves the team's colors, and the head script puts them back on the next load", () => {
    rememberLook(["#006400", "#ffd700"]);
    const saved = JSON.parse(store.get(LOOK_KEY)!) as Record<string, string>;
    expect(saved["--team"]).toBe("#006400");
    style.clear();
    runScript();
    expect(style.get("--team")).toBe("#006400");
    expect(style.get("--team-accent")).toBe("#ffd700");
  });

  it("ignores anything that isn't a team color", () => {
    store.set(
      LOOK_KEY,
      JSON.stringify({
        "--team": "red; background:url(x)",
        color: "#000000",
        "--team-press": "#123456",
      }),
    );
    runScript();
    expect(style.has("--team")).toBe(false);
    expect(style.has("color")).toBe(false);
    expect(style.get("--team-press")).toBe("#123456");
  });

  it("forgets on sign out, and survives broken storage", () => {
    rememberLook(["#006400"]);
    forgetLook();
    expect(store.has(LOOK_KEY)).toBe(false);
    store.set(LOOK_KEY, "not json");
    expect(runScript).not.toThrow();
  });
});
