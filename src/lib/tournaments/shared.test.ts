import { describe, expect, it } from "vitest";
import { asVisitor, fromShared, isShareToken, shareUrl } from "./shared";

const raw = {
  tournament: {
    id: "t1",
    name: "Cajun Fall Classic",
    organization: "Bayou Select",
    start_date: "2026-11-21",
    end_date: "2026-11-22",
    venues: ["Acadiana Sports Complex", 7],
    places: [],
    division: "10U",
    seeding: "pool",
    seeds: null,
    seeds_locked_at: null,
  },
  team: { name: "10U Canes", colors: ["#123456"], logo_path: null, timezone: "America/Chicago" },
  rules: { name: "Cajun Classic tiebreak", rules: [{ type: "head_to_head" }], restart: true },
  teams: [
    { id: "a", name: "Canes", is_us: true },
    { id: "b", name: "Houma", hometown: "Houma, LA" },
  ],
  games: [
    {
      id: "g1",
      game_no: "1",
      stage: "pool",
      pool: "A",
      game_date: "2026-11-21",
      start_time: "09:00:00",
      home: "Canes",
      away: "Houma",
      score_home: 5,
      score_away: 3,
      locked: true,
    },
  ],
};

describe("fromShared", () => {
  it("reads a shared tournament into the page's shapes", () => {
    const s = fromShared(raw)!;
    expect(s.tournament.name).toBe("Cajun Fall Classic");
    expect(s.tournament.venues).toEqual(["Acadiana Sports Complex"]);
    expect(s.tournament.seeding).toBe("pool");
    expect(s.tournament.tiebreakSetId).toBe("shared");
    expect(s.ruleSet?.name).toBe("Cajun Classic tiebreak");
    expect(s.teams.map((t) => t.isUs)).toEqual([true, false]);
    expect(s.games[0]).toMatchObject({ startTime: "09:00", scoreHome: 5, gameId: null });
    expect(s.team.name).toBe("10U Canes");
  });

  it("is null for a link that doesn't work", () => {
    expect(fromShared(null)).toBeNull();
    expect(fromShared({ tournament: null })).toBeNull();
  });

  it("copes with no rules, games or team details", () => {
    const s = fromShared({ tournament: { id: "t", name: "X" } })!;
    expect(s.ruleSet).toBeNull();
    expect(s.tournament.tiebreakSetId).toBeNull();
    expect(s.games).toEqual([]);
    expect(s.team.timezone).toBe("America/Chicago");
  });
});

describe("asVisitor", () => {
  it("makes the visitor's own team 'us'", () => {
    const teams = fromShared(raw)!.teams;
    expect(asVisitor(teams, "b").map((t) => t.isUs)).toEqual([false, true]);
    expect(asVisitor(teams, null).some((t) => t.isUs)).toBe(false);
  });
});

describe("share links", () => {
  it("checks tokens and builds the address", () => {
    expect(isShareToken("abcdef0123456789abcd")).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("abc-def-0123456789")).toBe(false);
    expect(shareUrl("abc123")).toBe("https://www.fungo.team/t/abc123");
  });
});
