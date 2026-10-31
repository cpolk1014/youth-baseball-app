import { describe, expect, it } from "vitest";
import { competitivePlan, type StatLine } from "./competitive";
import { makePlayer } from "./test-utils";

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

describe("competitivePlan batting order", () => {
  const players = ["a", "b", "c", "d", "e", "f"].map((id) => makePlayer(id));
  const lines = new Map<string, StatLine>([
    ["a", line({ obp: 0.55, slg: 0.4, ops: 0.95 })], // best on base
    ["b", line({ obp: 0.5, slg: 0.35, ops: 0.85 })], // next on base
    ["c", line({ obp: 0.45, slg: 0.7, ops: 1.15 })], // best bat
    ["d", line({ obp: 0.3, slg: 0.65, ops: 0.95 })], // power
    ["e", line({ obp: 0.3, slg: 0.3, ops: 0.6 })],
  ]);

  it("puts on-base first, the best bat third, power fourth, then by OPS, unknowns last", () => {
    const plan = competitivePlan(players, lines);
    expect(plan.battingOrder).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(plan.battingRole.get("a")).toBe("obp");
    expect(plan.battingRole.get("c")).toBe("ops");
    expect(plan.battingRole.get("d")).toBe("slg");
    expect(plan.battingRole.get("e")).toBe("rest");
    expect(plan.battingRole.get("f")).toBe("none");
  });

  it("ranks a tiny sample after real ones, and pulls it toward the average", () => {
    const hot = new Map(lines).set("e", line({ pa: 2, obp: 1, slg: 2, ops: 3 }));
    const plan = competitivePlan(players, hot);
    // 2 plate appearances of perfection don't beat 60 of very good.
    expect(plan.battingOrder.slice(0, 4)).toEqual(["a", "b", "c", "d"]);
    expect(plan.adjusted.get("e")!.obp!).toBeLessThan(0.7);
  });
});

describe("competitivePlan fielding and pitching", () => {
  const players = [
    makePlayer("ace", { canPitch: true }),
    makePlayer("arm", { canPitch: true }),
    makePlayer("ss"),
    makePlayer("new"),
  ];
  const lines = new Map<string, StatLine>([
    ["ace", line({ ip: 30, whip: 1.2, innings: { P: 30, "1B": 5 } })],
    ["arm", line({ ip: 2, whip: 0.5, innings: { P: 2, RF: 20 } })],
    ["ss", line({ fpct: 0.95, chances: 80, innings: { SS: 100, "2B": 10 } })],
  ]);
  const plan = competitivePlan(players, lines);

  it("trusts a long track record over a couple of great innings", () => {
    expect(plan.pitching.get("ace")).toBe(1);
    expect(plan.pitching.get("arm")).toBe(0);
    expect(plan.pitching.get("ss")).toBe(0);
  });

  it("fits kids where they've played the most", () => {
    expect(plan.fit.get("ss")!.SS).toBeGreaterThan(plan.fit.get("ace")!.SS);
    expect(plan.fit.get("arm")!.RF).toBeGreaterThan(plan.fit.get("ss")!.RF);
  });

  it("treats a kid with no stats as about average, with no history at a spot", () => {
    expect(plan.overall.get("new")).toBe(0.5);
    expect(plan.fit.get("new")!.SS).toBe(0.3);
    expect(plan.battingRole.get("new")).toBe("none");
  });

  it("10-fielder spots use center field innings", () => {
    const cf = competitivePlan(
      [makePlayer("x"), makePlayer("y")],
      new Map([
        ["x", line({ innings: { CF: 20 } })],
        ["y", line({ innings: { LF: 20 } })],
      ]),
    );
    expect(cf.fit.get("x")!.LCF).toBeGreaterThan(cf.fit.get("y")!.LCF);
  });
});
