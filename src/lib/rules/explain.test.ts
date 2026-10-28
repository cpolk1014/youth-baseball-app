import { describe, expect, it } from "vitest";
import { resolveRuleConfig } from "./config";
import { explainLineup } from "./explain";
import { GRID_12x6, ROSTER_12, lineupFromGrid } from "./test-utils";
import { validateLineup } from "./validate";

describe("explainLineup", () => {
  const config = resolveRuleConfig();
  const lineup = lineupFromGrid(GRID_12x6);

  it("lists the rules a fair lineup follows, with no trade-offs", () => {
    const e = explainLineup(
      ROSTER_12,
      lineup,
      config,
      [],
      validateLineup(ROSTER_12, lineup, config, []),
    );
    expect(e.tradeoffs).toEqual([]);
    expect(e.followed).toContain("No one sits more than 1 inning in a row");
    expect(e.followed).not.toContain("Everyone plays at least 1 outfield inning"); // off by default
    expect(e.players).toHaveLength(12);
  });

  it("explains each kid from facts: sits, positions, pitching", () => {
    const e = explainLineup(ROSTER_12, lineup, config, [], []);
    const a = e.players.find((p) => p.playerId === "a")!;
    expect(a.summary).toBe("Sat the 4th · 4 infield · 1 outfield");
    expect(a.reasons).toContain("Pitched the 1st and 2nd (limit 2).");
    expect(a.reasons[0]).toMatch(/No finished games yet/);
  });

  it("uses the season so far, comparing rates", () => {
    // Last game: j, k, l sat every inning.
    const history = [
      lineupFromGrid({
        ...Object.fromEntries(Object.keys(GRID_12x6).map((id) => [id, ["1B"]])),
        j: ["BENCH"],
        k: ["BENCH"],
        l: ["BENCH"],
      }),
    ];
    const e = explainLineup(ROSTER_12, lineup, config, history, []);
    expect(e.players.find((p) => p.playerId === "j")!.reasons[0]).toMatch(/more than most/);
    expect(e.players.find((p) => p.playerId === "a")!.reasons[0]).toMatch(/less than most/);
  });

  it("shows trade-offs, the coach's own rules, and who's absent", () => {
    const custom = resolveRuleConfig({
      custom: [{ id: "n", setting: "warn", kind: "never-plays", playerId: "a", positions: ["P"] }],
    });
    const withAbsent = { ...lineup, absent: ["l"] };
    const v = validateLineup(ROSTER_12, lineup, custom, []);
    const e = explainLineup(ROSTER_12, withAbsent, custom, [], v);
    expect(e.tradeoffs.some((t) => t.includes("shouldn't play pitcher"))).toBe(true);
    expect(e.players.find((p) => p.playerId === "a")!.reasons).toContain(
      "Your rule: A never plays pitcher.",
    );
    expect(e.absent).toEqual(["L"]);
    expect(e.followed).not.toContain("A never plays pitcher");
  });
});
