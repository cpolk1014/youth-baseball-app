import { describe, expect, it } from "vitest";
import {
  addDays,
  agesFromTeam,
  armStatus,
  armWarnings,
  restDays,
  whenLabel,
  type PitchSession,
} from "./rest";

let n = 0;
const s = (date: string, pitches: number, kind: PitchSession["kind"] = "game"): PitchSession => ({
  id: `s${++n}`,
  kind,
  date,
  pitches,
  strikes: null,
  gameId: null,
  statId: null,
  label: null,
});

describe("restDays (Pitch Smart, ages 7-14)", () => {
  it("goes up with the pitch count", () => {
    expect(restDays(0)).toBe(0);
    expect(restDays(20)).toBe(0);
    expect(restDays(21)).toBe(1);
    expect(restDays(35)).toBe(1);
    expect(restDays(36)).toBe(2);
    expect(restDays(50)).toBe(2);
    expect(restDays(51)).toBe(3);
    expect(restDays(65)).toBe(3);
    expect(restDays(66)).toBe(4);
    expect(restDays(110)).toBe(4);
  });
});

describe("agesFromTeam", () => {
  it("maps an age group to Pitch Smart ages", () => {
    expect(agesFromTeam("7U")).toBe("7-8");
    expect(agesFromTeam("8U")).toBe("7-8");
    expect(agesFromTeam("10U")).toBe("9-10");
    expect(agesFromTeam("11U AA")).toBe("11-12");
    expect(agesFromTeam("14U")).toBe("13-14");
    expect(agesFromTeam(null)).toBeNull();
    expect(agesFromTeam("Open")).toBeNull();
  });
});

describe("addDays", () => {
  it("crosses months", () => {
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("armStatus", () => {
  it("is ready with no pitches", () => {
    const a = armStatus([], "9-10", "2026-11-16");
    expect(a.resting).toBe(false);
    expect(a.leftToday).toBe(75);
    expect(a.max).toBe(75);
  });

  it("rests after a game: 48 pitches Saturday is 2 days, so Tuesday", () => {
    const a = armStatus([s("2026-11-14", 48)], "9-10", "2026-11-16");
    expect(a.resting).toBe(true);
    expect(a.canPitchOn).toBe("2026-11-17");
    expect(a.restFrom).toEqual({ date: "2026-11-14", pitches: 48, days: 2 });
    expect(a.leftToday).toBe(0);
    expect(armStatus([s("2026-11-14", 48)], "9-10", "2026-11-17").resting).toBe(false);
  });

  it("adds up two games in a day", () => {
    const a = armStatus([s("2026-11-15", 30), s("2026-11-15", 25)], "9-10", "2026-11-16");
    // 55 pitches: 3 days of rest.
    expect(a.canPitchOn).toBe("2026-11-19");
  });

  it("counts another team's game but not bullpens or lessons for rest", () => {
    expect(armStatus([s("2026-11-15", 60, "other_team")], "11-12", "2026-11-16").resting).toBe(
      true,
    );
    expect(
      armStatus(
        [s("2026-11-15", 60, "bullpen"), s("2026-11-15", 40, "lesson")],
        "11-12",
        "2026-11-16",
      ).resting,
    ).toBe(false);
  });

  it("knows what's left today", () => {
    const a = armStatus([s("2026-11-16", 40)], "9-10", "2026-11-16");
    expect(a.today).toBe(40);
    expect(a.leftToday).toBe(35);
    expect(a.resting).toBe(false);
  });

  it("totals the last 7 days", () => {
    const a = armStatus(
      [s("2026-11-09", 50), s("2026-11-10", 30, "bullpen"), s("2026-11-14", 20)],
      "9-10",
      "2026-11-16",
    );
    expect(a.last7).toBe(50);
    expect(a.last7Games).toBe(20);
  });

  it("ignores sessions in the future", () => {
    expect(armStatus([s("2026-11-20", 70)], "9-10", "2026-11-16").resting).toBe(false);
  });
});

describe("armWarnings", () => {
  it("flags a day over the limit", () => {
    const w = armWarnings([s("2026-11-14", 82)], "9-10");
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain("over the 75 a day for ages 9-10");
  });

  it("flags a bullpen on a rest day", () => {
    const w = armWarnings([s("2026-11-14", 48), s("2026-11-15", 25, "bullpen")], "9-10");
    expect(w).toHaveLength(1);
    expect(w[0]!.date).toBe("2026-11-15");
    expect(w[0]!.message).toMatch(/^A bullpen on Sun, Nov 15, a rest day after 48 pitches/);
  });

  it("is quiet when the rest was kept", () => {
    expect(armWarnings([s("2026-11-14", 48), s("2026-11-17", 25)], "9-10")).toEqual([]);
  });
});

describe("whenLabel", () => {
  it("says today, tomorrow or the day", () => {
    expect(whenLabel("2026-11-16", "2026-11-16")).toBe("today");
    expect(whenLabel("2026-11-17", "2026-11-16")).toBe("tomorrow");
    expect(whenLabel("2026-11-18", "2026-11-16")).toBe("Wed, Nov 18");
  });
});
