import { describe, expect, it } from "vitest";
import { isSongStyle, lyricLines, songHook, songPrompt, songRequest } from "./songPrompt";

type Plan = {
  positive_global_styles: string[];
  sections: { section_name: string; lines: string[]; duration_ms: number }[];
};

describe("songRequest", () => {
  it("asks for an instrumental when there are no words", () => {
    const body = songRequest({ style: "rock", vibe: 'slow "dramatic" intro\nthen boom' });
    expect(body).toMatchObject({
      model_id: "music_v1",
      force_instrumental: true,
      music_length_ms: 18000,
    });
    expect(body.prompt).toContain("stadium rock");
    expect(body.prompt).toContain("Vibe: slow dramatic intro then boom.");
    expect(body.composition_plan).toBeUndefined();
  });

  it("sings the kid's name and the family's words in a vocal section", () => {
    const body = songRequest({
      style: "hiphop",
      vibe: "big bass",
      hook: songHook("Jake Polk", "six seven"),
      lyrics: 'Step up to the plate\n\n  Bring the "heat" today ',
    });
    expect(body.prompt).toBeUndefined();
    expect(body.respect_sections_durations).toBe(true);
    const plan = body.composition_plan as Plan;
    expect(plan.positive_global_styles).toContain("big bass");
    expect(plan.sections.map((s) => s.section_name)).toEqual(["Intro", "Hook", "Outro"]);
    expect(plan.sections[0]!.lines).toEqual([]);
    expect(plan.sections[1]!.lines).toEqual([
      "Jake Polk! Number six seven!",
      "Step up to the plate",
      "Bring the heat today",
    ]);
    expect(plan.sections.reduce((t, s) => t + s.duration_ms, 0)).toBe(18000);
    for (const s of plan.sections) expect(s.duration_ms).toBeGreaterThanOrEqual(3000);
  });

  it("sings just the family's words when the name is left out", () => {
    const plan = songRequest({ style: "pop", lyrics: "Let's go" }).composition_plan as Plan;
    expect(plan.sections[1]!.lines).toEqual(["Let's go"]);
  });
});

describe("lyricLines", () => {
  it("keeps up to four short lines", () => {
    expect(lyricLines("a\nb\nc\nd\ne")).toEqual(["a", "b", "c", "d"]);
    expect(lyricLines("x".repeat(100))[0]!.length).toBe(60);
    expect(lyricLines(undefined)).toEqual([]);
  });
});

describe("songPrompt and hooks", () => {
  it("caps the vibe and checks styles", () => {
    expect(songPrompt({ style: "pop", vibe: "x".repeat(500) }).prompt.length).toBeLessThan(600);
    expect(songHook("Jake Polk", "six seven")).toBe("Jake Polk! Number six seven!");
    expect(songHook("Eli", null)).toBe("Eli!");
    expect(isSongStyle("edm")).toBe(true);
    expect(isSongStyle("polka")).toBe(false);
  });
});
