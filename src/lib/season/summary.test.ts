import { describe, expect, it } from "vitest";
import { resolveRuleConfig } from "@/lib/rules/config";
import { lineupFromGrid, makePlayer } from "@/lib/rules/test-utils";
import { seasonSummary } from "./summary";

const config = resolveRuleConfig({ seasonBalanceThreshold: 2 });
const players = [
  makePlayer("a", { jerseyNumber: 1 }),
  makePlayer("b", { jerseyNumber: 2 }),
  makePlayer("c", { jerseyNumber: 3 }),
  makePlayer("gone", { active: false }),
];

// Two games: c always on the bench / outfield, a always infield.
const game1 = lineupFromGrid({
  a: ["P", "P", "SS"],
  b: ["C", "LF", "BENCH"],
  c: ["BENCH", "BENCH", "LF"],
  gone: ["LF", "C", "C"],
});
const game2 = lineupFromGrid({
  a: ["SS", "SS", "1B"],
  b: ["1B", "1B", "LF"],
  c: ["BENCH", "LF", "BENCH"],
});

describe("seasonSummary", () => {
  const s = seasonSummary(players, [game1, game2], config);
  const byId = Object.fromEntries(s.rows.map((r) => [r.player.id, r]));

  it("totals innings per player across final games", () => {
    expect(s.finalGames).toBe(2);
    expect(byId.a).toMatchObject({ games: 2, field: 6, infield: 6, bench: 0 });
    expect(byId.a?.byPosition).toEqual({ P: 2, SS: 3, "1B": 1 });
    expect(byId.c).toMatchObject({ games: 2, field: 2, infield: 0, bench: 4 });
  });

  it("flags the same outliers as the season-balance rule", () => {
    // Active averages: infield (6 + 3 + 0) / 3 = 3, bench (0 + 1 + 4) / 3 ≈ 1.67.
    expect(s.avgInfield).toBe(3);
    expect(byId.c).toMatchObject({ lowInfield: true, highBench: true });
    expect(byId.a).toMatchObject({ lowInfield: false, highBench: false });
  });

  it("lists inactive players with innings separately and leaves them out of averages", () => {
    expect(s.rows.map((r) => r.player.id)).toEqual(["a", "b", "c"]);
    expect(s.inactiveRows.map((r) => r.player.id)).toEqual(["gone"]);
    expect(s.inactiveRows[0]).toMatchObject({ games: 1, infield: 2 });
  });

  it("has position columns plus bench, and no flags when the rule is off", () => {
    expect(s.positions.at(-1)).toBe("BENCH");
    const off = seasonSummary(
      players,
      [game1, game2],
      resolveRuleConfig({ seasonBalanceThreshold: null }),
    );
    expect(off.rows.some((r) => r.lowInfield || r.highBench)).toBe(false);
  });

  it("handles a season with no final games", () => {
    const empty = seasonSummary(players, [], config);
    expect(empty.finalGames).toBe(0);
    expect(empty.rows.every((r) => r.field === 0 && !r.lowInfield)).toBe(true);
  });

  it("shows columns for positions used across 9- and 10-fielder games", () => {
    const nine = lineupFromGrid({ a: ["CF"], b: ["P"] });
    const ten = lineupFromGrid({ a: ["LCF"], b: ["RCF"] });
    const cols = seasonSummary(players, [nine, ten], config).positions;
    expect(cols).toEqual(["P", "CF", "LCF", "RCF", "BENCH"]);
  });
});
