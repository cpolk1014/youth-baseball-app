import { describe, expect, it } from "vitest";
import type { Practice } from "@/lib/data/types";
import { applyPlan, cleanPlan, planRequestText, practiceLength } from "./aiPlan";

const practice = (id: string, extra: Partial<Practice> = {}): Practice => ({
  id,
  seasonId: "s",
  date: "2026-11-10",
  startTime: "17:30",
  endTime: "18:30",
  location: null,
  focus: null,
  notes: null,
  plan: [],
  canceled: false,
  plays: [],
  ...extra,
});

let n = 0;
const makeId = () => `d${++n}`;

describe("practiceLength", () => {
  it("uses the practice's times, or 75 minutes without them", () => {
    expect(practiceLength(practice("a"))).toBe(60);
    expect(practiceLength(practice("a", { startTime: null, endTime: null }))).toBe(75);
  });
});

describe("planRequestText", () => {
  it("lists the team, the coach's goals, each practice with its length, and the libraries", () => {
    const text = planRequestText({
      teamName: "Rattlers",
      ageGroup: "7U",
      coachPitch: true,
      activePlayers: 11,
      goals: "  Max reps.\n\n\n\nBe a great teammate. ",
      practices: [practice("p1", { focus: "Hitting" })],
      plays: [
        { id: "rundown", name: "Rundown", category: "Special plays", situation: "Runner caught" },
      ],
    });
    expect(text).toContain("Rattlers (7U), coach pitch, 11 players.");
    expect(text).toContain("Max reps.\n\nBe a great teammate.");
    expect(text).toContain("id=p1 · 2026-11-10 · 60 minutes · coach's focus: Hitting");
    expect(text).toContain("- rundown · Rundown · Special plays · Runner caught");
    expect(text).toContain("[Warm-up] Dynamic warm-up");
  });
});

describe("cleanPlan", () => {
  const practices = [practice("p1"), practice("p2")];
  const plays = new Set(["rundown", "bunt-pitcher"]);

  it("keeps known practices once, in schedule order, with real plays and focuses", () => {
    const plan = cleanPlan(
      {
        season_notes: "Build from catch to games.",
        practices: [
          {
            id: "p2",
            focus: "Scrimmage",
            theme: "Game day",
            drills: [],
            play_ids: ["rundown", "fake"],
            coach_note: "",
          },
          { id: "zzz", focus: "Hitting", theme: "", drills: [], play_ids: [], coach_note: "" },
          {
            id: "p1",
            focus: "Juggling",
            theme: "Catch",
            drills: [],
            play_ids: [],
            coach_note: "Cheer for each other.",
          },
          { id: "p1", focus: "Hitting", theme: "dupe", drills: [], play_ids: [], coach_note: "" },
        ],
      },
      practices,
      plays,
      makeId,
    );
    expect(plan.seasonNotes).toBe("Build from catch to games.");
    expect(plan.practices.map((p) => [p.practiceId, p.focus, p.theme])).toEqual([
      ["p1", null, "Catch"],
      ["p2", "Scrimmage", "Game day"],
    ]);
    expect(plan.practices[1]!.plays).toEqual(["rundown"]);
  });

  it("fits the drills to the practice's length and drops ones that make no sense", () => {
    const plan = cleanPlan(
      {
        practices: [
          {
            id: "p1",
            focus: "Hitting",
            theme: "",
            coach_note: "",
            play_ids: [],
            drills: [
              { title: "Warm-up", minutes: 10, notes: "Jog and stretch" },
              { title: "", minutes: 10, notes: "" },
              { title: "Tee stations", minutes: 30.4, notes: "" },
              { title: "Zero minutes", minutes: 0, notes: "" },
              { title: "Too long", minutes: 45, notes: "" },
              { title: "No time left", minutes: 5, notes: "" },
            ],
          },
        ],
      },
      practices,
      plays,
      makeId,
    );
    expect(plan.practices[0]!.plan.map((d) => [d.title, d.minutes])).toEqual([
      ["Warm-up", 10],
      ["Tee stations", 30],
      ["Too long", 20],
    ]);
    expect(plan.practices[0]!.plan[0]!.notes).toBe("Jog and stretch");
  });

  it("survives a reply with nothing in it", () => {
    expect(cleanPlan(null, practices, plays)).toEqual({ seasonNotes: "", practices: [] });
  });
});

describe("applyPlan", () => {
  it("replaces drills, plays and focus, and adds the theme after the coach's own notes", () => {
    const updated = applyPlan(practice("p1", { focus: "Infield", notes: "Bring helmets" }), {
      practiceId: "p1",
      focus: null,
      theme: "Rally caps on",
      plan: [{ id: "x", title: "Catch", minutes: 10 }],
      plays: ["rundown"],
      coachNote: "Celebrate effort.",
    });
    expect(updated.focus).toBe("Infield");
    expect(updated.plan).toHaveLength(1);
    expect(updated.plays).toEqual(["rundown"]);
    expect(updated.notes).toBe("Bring helmets\n\nTheme: Rally caps on\nCelebrate effort.");
  });
});
