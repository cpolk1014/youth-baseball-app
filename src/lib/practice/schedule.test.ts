import { describe, expect, it } from "vitest";
import {
  generatePracticeDates,
  movePlanItem,
  planMinutes,
  practiceMinutes,
  type PlanItem,
} from "./schedule";

describe("generatePracticeDates", () => {
  it("lists every chosen weekday between two dates, inclusive", () => {
    // Nov 2026: Tue 3, Thu 5, Tue 10, Thu 12.
    expect(
      generatePracticeDates({ start: "2026-11-03", end: "2026-11-12", weekdays: [2, 4] }),
    ).toEqual(["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"]);
  });

  it("handles month and year boundaries", () => {
    expect(
      generatePracticeDates({ start: "2026-12-28", end: "2027-01-05", weekdays: [1] }),
    ).toEqual(["2026-12-28", "2027-01-04"]);
  });

  it("returns nothing for bad ranges or no weekdays", () => {
    expect(
      generatePracticeDates({ start: "2026-11-10", end: "2026-11-01", weekdays: [2] }),
    ).toEqual([]);
    expect(generatePracticeDates({ start: "2026-11-01", end: "2026-11-30", weekdays: [] })).toEqual(
      [],
    );
    expect(generatePracticeDates({ start: "", end: "2026-11-30", weekdays: [2] })).toEqual([]);
  });

  it("caps a runaway range", () => {
    const dates = generatePracticeDates({
      start: "2026-01-01",
      end: "2030-12-31",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(dates).toHaveLength(120);
  });
});

describe("practice plans", () => {
  const plan: PlanItem[] = [
    { id: "a", title: "Warm-up", minutes: 10 },
    { id: "b", title: "Ground balls", minutes: 20 },
    { id: "c", title: "Live BP", minutes: 30 },
  ];

  it("totals plan minutes and the scheduled length", () => {
    expect(planMinutes(plan)).toBe(60);
    expect(practiceMinutes("18:00", "19:30")).toBe(90);
    expect(practiceMinutes("18:00", null)).toBeNull();
    expect(practiceMinutes("19:00", "18:00")).toBeNull();
  });

  it("moves drills up and down, ignoring moves off the ends", () => {
    expect(movePlanItem(plan, 2, -1).map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(movePlanItem(plan, 0, 1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(movePlanItem(plan, 0, -1)).toBe(plan);
    expect(movePlanItem(plan, 2, 1)).toBe(plan);
  });
});
