import { describe, expect, it } from "vitest";
import { ago, payingTeams, percent, readOverview, seasonRevenue, setupGap } from "./overview";

const raw = {
  generated_at: "2026-11-23T18:00:00Z",
  users: { total: 40, new_7: 5, new_30: "12" },
  teams: { total: 9, by_plan: { club: 3, pass: 2, grace: 1, trial: 2, weird: 9 } },
  revenue: { season: { club: 29700, team: 12900, family: 1900 }, last_30: 14800, all_time: 44500 },
  ai: { by_kind_30: [{ kind: "practice_plan", calls: 4, cents: "12.5" }] },
  daily: [{ day: "2026-11-22T00:00:00", users: 2, teams: 1, cents: 0 }],
  recent_teams: [
    { id: "t", name: "10U Canes", age_group: "10U", plan: "mystery", players: 11, games: 0 },
  ],
};

describe("readOverview", () => {
  it("reads the numbers, filling in what's missing", () => {
    const o = readOverview(raw);
    expect(o.users.new30).toBe(12);
    expect(o.users.active7).toBe(0);
    expect(o.teams.byPlan).toEqual({ club: 3, pass: 2, grace: 1, trial: 2, launch: 0, none: 0 });
    expect(o.ai.byKind30[0]!.cents).toBe(12.5);
    expect(o.daily[0]!.day).toBe("2026-11-22");
    expect(o.recentTeams[0]!.plan).toBe("none");
    expect(o.shares.top).toEqual([]);
  });

  it("copes with nothing at all", () => {
    const o = readOverview(null);
    expect(o.teams.total).toBe(0);
    expect(o.recentPurchases).toEqual([]);
  });
});

describe("sums", () => {
  it("counts paying teams and this season's money", () => {
    const o = readOverview(raw);
    expect(payingTeams(o)).toBe(6);
    expect(seasonRevenue(o)).toBe(44500);
  });

  it("gives a percent only when there's something to divide", () => {
    expect(percent(3, 40)).toBe(8);
    expect(percent(0, 0)).toBeNull();
  });
});

describe("setupGap", () => {
  it("names the first thing a team is missing", () => {
    expect(setupGap({ players: 0, games: 0, lineups: 0, parents: 0 })).toBe("No players");
    expect(setupGap({ players: 11, games: 3, lineups: 0, parents: 0 })).toBe("No lineup");
    expect(setupGap({ players: 11, games: 3, lineups: 2, parents: 5 })).toBeNull();
  });
});

describe("ago", () => {
  const now = Date.parse("2026-11-23T18:00:00Z");
  it("says how long ago, in short words", () => {
    expect(ago(null, now)).toBe("never");
    expect(ago("2026-11-23T17:30:00Z", now)).toBe("just now");
    expect(ago("2026-11-23T13:00:00Z", now)).toBe("5h ago");
    expect(ago("2026-11-20T18:00:00Z", now)).toBe("3d ago");
    expect(ago("2026-10-01T18:00:00Z", now)).toBe("Oct 1");
  });
});
