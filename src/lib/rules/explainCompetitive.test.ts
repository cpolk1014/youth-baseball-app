import { describe, expect, it } from "vitest";
import { competitivePlan, type StatLine } from "./competitive";
import { DEFAULT_RULE_CONFIG, resolveRuleConfig } from "./config";
import { explainCompetitive } from "./explainCompetitive";
import { lineupFromGrid, makePlayer } from "./test-utils";

const config = resolveRuleConfig();
const line = (o: Partial<StatLine>): StatLine => ({
  pa: 60,
  obp: 0.35,
  slg: 0.35,
  ops: 0.7,
  ip: 0,
  whip: null,
  era: null,
  fpct: 0.9,
  chances: 30,
  innings: {},
  ...o,
});
const roster = [
  makePlayer("ace", { name: "Ace", canPitch: true }),
  makePlayer("ss", { name: "Shorty" }),
  makePlayer("new", { name: "Newbie" }),
];
const lines = new Map<string, StatLine>([
  ["ace", line({ obp: 0.5, ops: 1.1, ip: 36 + 1 / 3, whip: 1.62, innings: { P: 36 } })],
  ["ss", line({ obp: 0.45, ops: 0.9, fpct: 0.937, innings: { SS: 158 + 2 / 3 } })],
]);
const plan = competitivePlan(roster, lines);
const lineup = lineupFromGrid(
  { ace: ["P", "P"], ss: ["SS", "SS"], new: ["LF", "BENCH"] },
  plan.battingOrder,
);

describe("explainCompetitive", () => {
  const why = explainCompetitive(roster, lineup, config, [], plan, "Oct 30");
  const reasons = (id: string) => why.players.find((p) => p.playerId === id)!.reasons;

  it("says how the lineup was made", () => {
    expect(why.intro?.[0]).toMatch(/Competitive lineup.*GameChanger stats \(imported Oct 30\)/);
    expect(why.intro?.join(" ")).toMatch(/Warn rules were set aside/);
  });

  it("lists only Must rules as followed", () => {
    expect(why.followed.length).toBeGreaterThan(0);
    expect(why.followed.join(" ")).not.toMatch(/season/i);
  });

  it("gives the stats behind batting spots, positions and pitching", () => {
    expect(reasons("ace")).toContain("Bats 1st: best on-base % (.500 OBP).");
    expect(reasons("ace").join(" ")).toMatch(
      /Pitches the 1st and 2nd: 1\.62 WHIP over 36⅓ innings, the only one who can pitch today with pitching stats/,
    );
    expect(reasons("ss").join(" ")).toMatch(
      /Plays SS the 1st and 2nd: most innings there this season \(158⅔\), fielding \.937/,
    );
  });

  it("is honest about kids without stats and about sits", () => {
    expect(reasons("new")[0]).toMatch(/No GameChanger stats/);
    expect(reasons("new").join(" ")).toMatch(/Sits the 2nd: ranks 3rd of 3/);
  });

  it("notes when the coach moved someone in the order", () => {
    const moved = { ...lineup, battingOrder: ["ss", "ace", "new"] };
    const r = explainCompetitive(roster, moved, config, [], plan, null).players[0]!.reasons;
    expect(r.join(" ")).toMatch(/Bats 2nd: moved from 1st/);
  });

  it("without stats (parents), explains the approach but shows no numbers", () => {
    const blind = explainCompetitive(roster, lineup, config, [], null, null);
    expect(blind.intro?.[0]).toMatch(/Competitive lineup/);
    expect(blind.players.every((p) => p.reasons.length === 0)).toBe(true);
  });
});

describe("explainCompetitive recent form", () => {
  it("says who's hot and why they moved up", () => {
    const kids = [makePlayer("a"), makePlayer("b")];
    const base = {
      pa: 60,
      ip: 0,
      whip: null,
      era: null,
      fpct: null,
      chances: 0,
      innings: {},
    };
    const plan = competitivePlan(
      kids,
      new Map([
        ["a", { ...base, obp: 0.4, slg: 0.4, ops: 0.8 }],
        ["b", { ...base, obp: 0.28, slg: 0.25, ops: 0.53 }],
      ]),
      new Map([
        [
          "b",
          {
            pa: 22,
            ab: 20,
            h: 9,
            avg: 0.45,
            obp: 0.5,
            slg: 0.6,
            ops: 1.1,
            from: "2026-11-01",
            to: "2026-11-14",
            games: 6,
            source: "box" as const,
          },
        ],
      ]),
    );
    const order = { innings: 1, slots: [], battingOrder: ["a", "b"], notBatting: [], absent: [] };
    const why = explainCompetitive(
      kids,
      order,
      DEFAULT_RULE_CONFIG,
      [],
      plan,
      null,
      "the team's box scores",
    );
    expect(why.intro?.[0]).toBe("Competitive lineup: built to win from the team's box scores.");
    const b = why.players.find((p) => p.playerId === "b")!;
    expect(
      b.reasons.some((r) => r.startsWith("🔥 Hot lately: 9 for 20 (.450) over the last 6 games")),
    ).toBe(true);
  });
});
