import { describe, expect, it } from "vitest";
import type { Practice } from "@/lib/data/types";
import { drillTimes, practiceMonths } from "./print";

const practice = (id: string, date: string, startTime: string | null = "18:00"): Practice => ({
  id,
  seasonId: "s",
  date,
  startTime,
  endTime: null,
  location: null,
  focus: null,
  notes: null,
  plan: [],
  canceled: false,
  plays: [],
});

describe("practiceMonths", () => {
  const all = [
    practice("dec", "2026-12-02"),
    practice("old", "2026-10-28"),
    practice("late", "2026-11-20", "19:00"),
    practice("early", "2026-11-20", "17:00"),
    practice("today", "2026-11-17"),
  ];

  it("prints upcoming practices (today on), in order, by month", () => {
    const m = practiceMonths(all, "upcoming", "2026-11-17");
    expect(m.map((x) => x.label)).toEqual(["November 2026", "December 2026"]);
    expect(m[0]!.practices.map((p) => p.id)).toEqual(["today", "early", "late"]);
  });

  it("prints the whole season", () => {
    const m = practiceMonths(all, "season", "2026-11-17");
    expect(m.map((x) => x.label)).toEqual(["October 2026", "November 2026", "December 2026"]);
  });

  it("is empty with nothing to print", () => {
    expect(practiceMonths([practice("old", "2026-10-01")], "upcoming", "2026-11-17")).toEqual([]);
  });
});

describe("drillTimes", () => {
  it("runs the drills back to back from the start time", () => {
    expect(drillTimes("17:45", [{ minutes: 10 }, { minutes: 18 }, { minutes: 40 }])).toEqual([
      { from: "5:45", to: "5:55" },
      { from: "5:55", to: "6:13" },
      { from: "6:13", to: "6:53" },
    ]);
  });

  it("crosses noon and needs a start time", () => {
    expect(drillTimes("11:50", [{ minutes: 20 }])).toEqual([{ from: "11:50", to: "12:10" }]);
    expect(drillTimes(null, [{ minutes: 20 }])).toBeNull();
  });
});
