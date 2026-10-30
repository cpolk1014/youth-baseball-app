import { describe, expect, it } from "vitest";
import { cleanLyricOptions, isLyricTheme, LYRIC_THEMES, lyricsRequest } from "./lyrics";

describe("lyricsRequest", () => {
  it("tells Claude about the kid, the theme and the song", () => {
    const text = lyricsRequest({
      theme: "speed",
      styleLabel: "Hip-hop hype",
      name: "Jake",
      number: "six seven",
      teamName: "Riverside Rattlers",
      ageGroup: "10U",
      hookFirst: true,
      idea: 'he loves "stealing" second\nalways smiling',
    });
    expect(text).toContain("Player: Jake, number six seven.");
    expect(text).toContain("Team: Riverside Rattlers (10U).");
    expect(text).toContain("Theme: speed");
    expect(text).toContain("chants the player's name and number first");
    expect(text).toContain("Family's idea: he loves stealing second always smiling");
  });

  it("leaves out what isn't there", () => {
    const text = lyricsRequest({
      theme: "hype",
      styleLabel: "Pop",
      name: "Eli",
      number: null,
      teamName: "Canes",
      ageGroup: "",
      hookFirst: false,
    });
    expect(text).toContain("Player: Eli.");
    expect(text).toContain("(youth)");
    expect(text).toContain("only words in the song");
    expect(text).not.toContain("Family's idea");
  });
});

describe("cleanLyricOptions", () => {
  it("keeps up to three options of two to four clean lines", () => {
    const out = cleanLyricOptions({
      options: [
        {
          title: "Fast Lane",
          lines: [
            "Here comes Jake",
            'Faster than "light"',
            "Steal that bag",
            "Gone tonight",
            "extra",
          ],
        },
        { title: "", lines: ["Only one line"] },
        { title: "Two", lines: ["Line one", "Line two"] },
        { title: "Three", lines: ["a", "b"] },
        { title: "Four", lines: ["c", "d"] },
      ],
    });
    expect(out).toEqual([
      {
        title: "Fast Lane",
        lines: ["Here comes Jake", "Faster than light", "Steal that bag", "Gone tonight"],
      },
      { title: "Two", lines: ["Line one", "Line two"] },
      { title: "Three", lines: ["a", "b"] },
    ]);
  });

  it("names untitled options and survives junk", () => {
    expect(cleanLyricOptions({ options: [{ lines: ["a", "b"] }] })[0]!.title).toBe("Option 1");
    expect(cleanLyricOptions(null)).toEqual([]);
    expect(cleanLyricOptions({ options: "nope" })).toEqual([]);
  });

  it("knows its themes", () => {
    expect(LYRIC_THEMES.length).toBeGreaterThanOrEqual(6);
    expect(isLyricTheme("clutch")).toBe(true);
    expect(isLyricTheme("rude")).toBe(false);
  });
});
