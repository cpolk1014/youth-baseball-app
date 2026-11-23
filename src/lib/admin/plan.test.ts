import { describe, expect, it } from "vitest";
import { dueText, goals, readScoreboard, readTasks, sectionTasks, taskTotals } from "./plan";

const board = readScoreboard({
  revenue_season: 4_450_000,
  clubs_paying: 2,
  club_teams: 26,
  independent_teams: 4,
  pass_families: 6,
  pass_kids: 8,
  parent_accounts: 60,
  parents_with_pass: 6,
  ai_cents_paid_season: "9000",
  paying_teams: 30,
  trials: 10,
  trials_7_days_old: 8,
  trials_lineup_7: 4,
  trials_30_days_old: 0,
  trials_paid_30: 0,
  teams_with_players: 30,
  parent_links: 150,
  renewed: 0,
});

const goal = (key: string) => goals(board).find((g) => g.key === key)!;

describe("goals", () => {
  it("measures revenue against $1M", () => {
    expect(goal("revenue").now).toBe("$44,500");
    expect(goal("revenue").progress).toBeCloseTo(0.0445);
  });

  it("works out rates", () => {
    expect(goal("attach").now).toBe("10%");
    expect(goal("attach").progress).toBeCloseTo(0.25);
    expect(goal("lineup7").now).toBe("50%");
    expect(goal("parents").now).toBe("5.0");
  });

  it("shows a dash when there's nothing to measure yet", () => {
    expect(goal("paid30").now).toBe("–");
    expect(goal("paid30").progress).toBeNull();
    expect(goal("heard").progress).toBeNull();
  });

  it("fills the AI bar as cost stays under $15 a team", () => {
    expect(goal("ai").now).toBe("$3.00");
    expect(goal("ai").progress).toBeCloseTo(0.8);
  });
});

describe("to-dos", () => {
  const tasks = readTasks([
    { id: "1", section: "weekly", title: "B", sort: 20, status: "todo", due_week: "2026-11-30" },
    { id: "2", section: "weekly", title: "A", sort: 10, status: "doing", due_week: "2026-11-23" },
    { id: "3", section: "weekly", title: "C", sort: 5, status: "todo" },
    {
      id: "4",
      section: "weekly",
      title: "D",
      status: "done",
      done_at: "2026-11-23T10:00:00Z",
    },
    { id: "5", section: "nonsense", title: "E", status: "weird" },
  ]);

  it("reads rows, filling in what's odd", () => {
    expect(tasks[4]).toMatchObject({ section: "mine", status: "todo" });
  });

  it("orders open ones by due week and keeps done ones apart", () => {
    const { open, done } = sectionTasks(tasks, "weekly");
    expect(open.map((t) => t.title)).toEqual(["A", "B", "C"]);
    expect(done.map((t) => t.title)).toEqual(["D"]);
  });

  it("says when a week has passed", () => {
    expect(dueText({ dueWeek: "2026-11-23", status: "todo" }, "2026-12-02")).toBe(
      "Week of Nov 23 · late",
    );
    expect(dueText({ dueWeek: "2026-11-23", status: "todo" }, "2026-11-25")).toBe("Week of Nov 23");
    expect(dueText({ dueWeek: "2026-11-23", status: "done" }, "2026-12-02")).toBe("Week of Nov 23");
    expect(dueText({ dueWeek: null, status: "todo" }, "2026-12-02")).toBeNull();
  });

  it("totals the list", () => {
    expect(taskTotals(tasks)).toEqual({ done: 1, doing: 1, total: 5 });
  });
});
