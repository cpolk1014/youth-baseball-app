import { describe, expect, it } from "vitest";
import { DRILL_NOTES_MAX } from "./aiPlan";
import { MAX_PLAN_DRILLS, MAX_READ_PLANS, PLAN_READ_PROMPT, cleanReadPlans } from "./planRead";

describe("cleanReadPlans", () => {
  it("keeps plans with titled drills, minutes and notes", () => {
    const out = cleanReadPlans({
      plans: [
        {
          title: "  Winter Workouts ",
          focus: null,
          drills: [
            { title: "Warm-up & throwing", minutes: 20, notes: "Dynamic warm-up\r\n1. Jog" },
            { title: "Base running station", minutes: 25, notes: "" },
          ],
        },
      ],
      warnings: ["Minutes were guessed"],
    });
    expect(out).toEqual({
      plans: [
        {
          title: "Winter Workouts",
          focus: null,
          items: [
            { title: "Warm-up & throwing", minutes: 20, notes: "Dynamic warm-up\n1. Jog" },
            { title: "Base running station", minutes: 25 },
          ],
        },
      ],
      warnings: ["Minutes were guessed"],
    });
  });

  it("keeps only focuses from the list", () => {
    const drills = [{ title: "Tee work", minutes: 10, notes: "" }];
    const out = cleanReadPlans({
      plans: [
        { title: "A", focus: "Hitting", drills },
        { title: "B", focus: "Bunting stuff", drills },
      ],
    });
    expect(out.plans.map((p) => p.focus)).toEqual(["Hitting", null]);
  });

  it("fixes minutes: whole, 1 to 120, 10 when missing", () => {
    const out = cleanReadPlans({
      plans: [
        {
          title: "P",
          drills: [
            { title: "a", minutes: 12.6 },
            { title: "b", minutes: 500 },
            { title: "c", minutes: 0 },
            { title: "d", minutes: "x" },
          ],
        },
      ],
    });
    expect(out.plans[0]!.items.map((i) => i.minutes)).toEqual([13, 120, 10, 10]);
  });

  it("drops untitled drills and empty plans, names untitled plans", () => {
    const out = cleanReadPlans({
      plans: [
        { title: "Empty", drills: [{ title: "  ", minutes: 5 }] },
        { title: "", drills: [{ title: "Long toss", minutes: 10 }] },
        null,
      ],
    });
    expect(out.plans).toEqual([
      { title: "Practice plan 1", focus: null, items: [{ title: "Long toss", minutes: 10 }] },
    ]);
  });

  it("caps plans, drills, notes and warnings", () => {
    const drill = { title: "d", minutes: 5, notes: "x".repeat(DRILL_NOTES_MAX + 50) };
    const out = cleanReadPlans({
      plans: Array.from({ length: MAX_READ_PLANS + 3 }, (_, i) => ({
        title: `P${i}`,
        drills: Array.from({ length: MAX_PLAN_DRILLS + 5 }, () => drill),
      })),
      warnings: Array.from({ length: 20 }, (_, i) => `w${i}`),
    });
    expect(out.plans).toHaveLength(MAX_READ_PLANS);
    expect(out.plans[0]!.items).toHaveLength(MAX_PLAN_DRILLS);
    expect(out.plans[0]!.items[0]!.notes).toHaveLength(DRILL_NOTES_MAX);
    expect(out.warnings).toHaveLength(10);
  });

  it("handles garbage", () => {
    expect(cleanReadPlans(null)).toEqual({ plans: [], warnings: [] });
    expect(cleanReadPlans({ plans: "no", warnings: [3, ""] })).toEqual({ plans: [], warnings: [] });
  });

  it("names the focus list in the prompt", () => {
    expect(PLAN_READ_PROMPT).toContain("Hitting, Infield");
  });
});
