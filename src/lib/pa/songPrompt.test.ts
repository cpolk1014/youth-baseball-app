import { describe, expect, it } from "vitest";
import { isSongStyle, songHook, songPrompt } from "./songPrompt";

describe("songPrompt", () => {
  it("builds an instrumental prompt from a style and vibe", () => {
    const { prompt, instrumental } = songPrompt({
      style: "rock",
      vibe: 'slow "dramatic" intro\nthen boom',
    });
    expect(instrumental).toBe(true);
    expect(prompt).toContain("stadium rock");
    expect(prompt).toContain("Vibe: slow dramatic intro then boom.");
    expect(prompt).toContain("Instrumental");
  });

  it("chants the kid's name when asked", () => {
    const hook = songHook("Jake Polk", "six seven");
    expect(hook).toBe("Jake Polk! Number six seven!");
    const { prompt, instrumental } = songPrompt({ style: "hiphop", hook });
    expect(instrumental).toBe(false);
    expect(prompt).toContain('"Jake Polk! Number six seven!"');
    expect(prompt).toContain("No other lyrics");
  });

  it("caps the vibe and checks styles", () => {
    expect(songPrompt({ style: "pop", vibe: "x".repeat(500) }).prompt.length).toBeLessThan(600);
    expect(songHook("Eli", null)).toBe("Eli!");
    expect(isSongStyle("edm")).toBe(true);
    expect(isSongStyle("polka")).toBe(false);
  });
});
