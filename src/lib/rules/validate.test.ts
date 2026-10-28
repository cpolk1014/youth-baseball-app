import { describe, expect, it } from "vitest";
import { resolveRuleConfig } from "./config";
import {
  GRID_12x6,
  GRID_9x4,
  ROSTER_12,
  ROSTER_9,
  lineupFromGrid,
  makePlayer,
  withCell,
} from "./test-utils";
import type { Lineup, Player, Position, RuleId, Violation } from "./types";
import { validateLineup } from "./validate";

const config = resolveRuleConfig();

function rules(violations: Violation[]): Violation["rule"][] {
  return [...new Set(violations.map((v) => v.rule))].sort();
}

function only(violations: Violation[], rule: RuleId): Violation[] {
  return violations.filter((v) => v.rule === rule);
}

function setFlags(roster: Player[], id: string, flags: Partial<Player>): Player[] {
  return roster.map((p) => (p.id === id ? { ...p, ...flags } : p));
}

describe("validateLineup — baselines", () => {
  it("accepts a fair 12-player, 6-inning lineup with no violations", () => {
    expect(validateLineup(ROSTER_12, lineupFromGrid(GRID_12x6), config, [])).toEqual([]);
  });

  it("accepts a 9-player, 4-inning lineup where nobody sits", () => {
    expect(validateLineup(ROSTER_9, lineupFromGrid(GRID_9x4), config, [])).toEqual([]);
  });

  it("ignores inactive roster players", () => {
    const roster = [...ROSTER_9, makePlayer("injured", { active: false })];
    expect(validateLineup(roster, lineupFromGrid(GRID_9x4), config, [])).toEqual([]);
  });
});

describe("invalid-slot", () => {
  it("blocks a slot for a player not on the roster", () => {
    const lineup = lineupFromGrid({ ...GRID_9x4, ghost: ["BENCH", "BENCH", "BENCH", "BENCH"] });
    const v = only(validateLineup(ROSTER_9, lineup, config, []), "invalid-slot");
    expect(v).toHaveLength(4);
    expect(v[0]).toMatchObject({ playerId: "ghost", severity: "block" });
  });

  it("blocks a slot outside the game's innings (inning 5 of a 4-inning game)", () => {
    const lineup = lineupFromGrid(GRID_9x4);
    lineup.slots.push({ inning: 5, playerId: "p1", position: "BENCH" });
    const v = only(validateLineup(ROSTER_9, lineup, config, []), "invalid-slot");
    expect(v).toEqual([expect.objectContaining({ playerId: "p1", inning: 5 })]);
  });

  it("blocks a position not used by this season's config", () => {
    const lineup = lineupFromGrid(withCell(GRID_9x4, "p7", 1, "LCF"));
    const v = validateLineup(ROSTER_9, lineup, config, []);
    expect(only(v, "invalid-slot")).toEqual([
      expect.objectContaining({ playerId: "p7", inning: 1, severity: "block" }),
    ]);
  });
});

describe("position-coverage: every position filled exactly once per inning", () => {
  it("blocks an unfilled position", () => {
    const lineup = lineupFromGrid(withCell(GRID_12x6, "j", 3, "BENCH"));
    const v = only(validateLineup(ROSTER_12, lineup, config, []), "position-coverage");
    expect(v).toEqual([expect.objectContaining({ inning: 3, severity: "block" })]);
    expect(v[0]?.message).toContain("SS");
  });

  it("blocks a position filled twice", () => {
    const lineup = lineupFromGrid(withCell(GRID_12x6, "j", 1, "SS"));
    const v = only(validateLineup(ROSTER_12, lineup, config, []), "position-coverage");
    expect(v).toEqual([expect.objectContaining({ inning: 1, severity: "block" })]);
  });

  it("supports a 10-fielder config with LCF/RCF", () => {
    const ten = resolveRuleConfig({
      fieldPositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"],
    });
    const grid = { ...GRID_9x4, p8: ["LCF", "LCF", "2B", "2B"] as Position[] };
    const lineup = lineupFromGrid({ ...grid, p10: ["RCF", "RCF", "LCF", "LCF"] });
    // Inning 3–4 have no RCF; CF is not a position in this config.
    const roster = [...ROSTER_9, makePlayer("p10")];
    const v = validateLineup(roster, lineup, ten, []);
    expect(only(v, "position-coverage").map((x) => x.inning)).toEqual([3, 4]);
    expect(only(v, "invalid-slot").map((x) => x.playerId)).toEqual(["p5", "p5"]);
  });
});

describe("player-assignment: each active player exactly one slot per inning", () => {
  it("blocks a player in two positions in one inning", () => {
    const lineup = lineupFromGrid(GRID_9x4);
    lineup.slots.push({ inning: 2, playerId: "p5", position: "BENCH" });
    const v = only(validateLineup(ROSTER_9, lineup, config, []), "player-assignment");
    expect(v).toEqual([expect.objectContaining({ playerId: "p5", inning: 2, severity: "block" })]);
  });

  it("blocks an active player missing from an inning", () => {
    const lineup = lineupFromGrid(GRID_12x6);
    lineup.slots = lineup.slots.filter((s) => !(s.playerId === "j" && s.inning === 1));
    const v = only(validateLineup(ROSTER_12, lineup, config, []), "player-assignment");
    expect(v).toEqual([expect.objectContaining({ playerId: "j", inning: 1 })]);
  });
});

describe("batting-order", () => {
  it("blocks a player missing from the batting order", () => {
    const lineup: Lineup = { ...lineupFromGrid(GRID_9x4), battingOrder: ["p1", "p2"] };
    const v = only(validateLineup(ROSTER_9, lineup, config, []), "batting-order");
    expect(v.map((x) => x.playerId).sort()).toEqual(["p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
  });

  it("blocks duplicate and unknown batters", () => {
    const order = [...Object.keys(GRID_9x4), "p1", "ghost"];
    const lineup = { ...lineupFromGrid(GRID_9x4), battingOrder: order };
    const v = only(validateLineup(ROSTER_9, lineup, config, []), "batting-order");
    expect(v.map((x) => x.playerId).sort()).toEqual(["ghost", "p1"]);
  });
});

describe("max-consecutive-bench", () => {
  // d sits innings 2 and 3 (g plays LF in inning 2 instead).
  const grid = withCell(withCell(GRID_12x6, "d", 2, "BENCH"), "g", 2, "LF");

  it("blocks sitting two innings in a row by default", () => {
    const v = only(
      validateLineup(ROSTER_12, lineupFromGrid(grid), config, []),
      "max-consecutive-bench",
    );
    expect(v).toEqual([expect.objectContaining({ playerId: "d", inning: 3, severity: "block" })]);
  });

  it("allows it when the limit is 2", () => {
    const v = validateLineup(
      ROSTER_12,
      lineupFromGrid(grid),
      resolveRuleConfig({ maxConsecutiveBench: 2 }),
      [],
    );
    expect(only(v, "max-consecutive-bench")).toEqual([]);
  });

  it("can be downgraded to a warning", () => {
    const v = validateLineup(
      ROSTER_12,
      lineupFromGrid(grid),
      resolveRuleConfig({ severity: { "max-consecutive-bench": "warn" } }),
      [],
    );
    expect(only(v, "max-consecutive-bench")[0]?.severity).toBe("warn");
  });
});

describe("bench-rotation: nobody sits twice before everyone has sat once", () => {
  // j sits innings 1 and 3, before a/b/c sit in inning 4.
  const grid = withCell(withCell(GRID_12x6, "j", 3, "BENCH"), "d", 3, "SS");

  it("warns on the second sit", () => {
    const v = only(validateLineup(ROSTER_12, lineupFromGrid(grid), config, []), "bench-rotation");
    expect(v).toEqual([expect.objectContaining({ playerId: "j", inning: 3, severity: "warn" })]);
  });

  it("is off when benchRotation is false", () => {
    const v = validateLineup(
      ROSTER_12,
      lineupFromGrid(grid),
      resolveRuleConfig({ benchRotation: false }),
      [],
    );
    expect(only(v, "bench-rotation")).toEqual([]);
  });

  it("never fires with 9 players", () => {
    expect(rules(validateLineup(ROSTER_9, lineupFromGrid(GRID_9x4), config, []))).toEqual([]);
  });
});

describe("min-infield", () => {
  // p7 only ever plays LF; p2 takes their 1B innings.
  const grid = {
    ...GRID_9x4,
    p7: ["LF", "LF", "LF", "LF"] as Position[],
    p2: ["C", "C", "1B", "1B"] as Position[],
  };

  it("blocks a player with no infield innings", () => {
    const v = only(validateLineup(ROSTER_9, lineupFromGrid(grid), config, []), "min-infield");
    expect(v).toEqual([expect.objectContaining({ playerId: "p7", severity: "block" })]);
  });

  it("is off at 0 and stricter at 3", () => {
    const off = validateLineup(
      ROSTER_9,
      lineupFromGrid(grid),
      resolveRuleConfig({ minInfieldInnings: 0 }),
      [],
    );
    expect(only(off, "min-infield")).toEqual([]);
    const strict = validateLineup(
      ROSTER_9,
      lineupFromGrid(GRID_9x4),
      resolveRuleConfig({ minInfieldInnings: 3 }),
      [],
    );
    expect(
      only(strict, "min-infield")
        .map((x) => x.playerId)
        .sort(),
    ).toEqual(["p2", "p5", "p6", "p7", "p8", "p9"]);
  });
});

describe("max-same-position", () => {
  const grid = withCell(withCell(GRID_9x4, "p1", 3, "P"), "p3", 3, "SS");

  it("warns when a player is at one position more than N innings", () => {
    const v = only(
      validateLineup(
        ROSTER_9,
        lineupFromGrid(grid),
        resolveRuleConfig({ maxInningsPitched: 3 }),
        [],
      ),
      "max-same-position",
    );
    expect(v).toEqual([expect.objectContaining({ playerId: "p1", severity: "warn" })]);
    expect(v[0]?.message).toContain("P");
  });

  it("is off when null", () => {
    const v = validateLineup(
      ROSTER_9,
      lineupFromGrid(grid),
      resolveRuleConfig({ maxInningsSamePosition: null, maxInningsPitched: 3 }),
      [],
    );
    expect(only(v, "max-same-position")).toEqual([]);
  });
});

describe("pitcher and catcher eligibility", () => {
  it("blocks a pitcher who can't pitch", () => {
    const roster = setFlags(ROSTER_9, "p1", { canPitch: false });
    const v = only(
      validateLineup(roster, lineupFromGrid(GRID_9x4), config, []),
      "pitcher-eligibility",
    );
    expect(v.map((x) => [x.playerId, x.inning])).toEqual([
      ["p1", 1],
      ["p1", 2],
    ]);
    expect(v[0]?.severity).toBe("block");
  });

  it("blocks a catcher who can't catch", () => {
    const roster = setFlags(ROSTER_9, "p4", { canCatch: false });
    const v = only(
      validateLineup(roster, lineupFromGrid(GRID_9x4), config, []),
      "catcher-eligibility",
    );
    expect(v.map((x) => [x.playerId, x.inning])).toEqual([
      ["p4", 3],
      ["p4", 4],
    ]);
  });

  it("allows one catcher to catch every inning (warn only, never block)", () => {
    const roster = ROSTER_9.map((p) => ({ ...p, canCatch: p.id === "p2" }));
    const grid = {
      ...GRID_9x4,
      p2: ["C", "C", "C", "C"] as Position[],
      p4: ["2B", "2B", "LF", "LF"] as Position[],
    };
    const v = validateLineup(roster, lineupFromGrid(grid), config, []);
    expect(v.filter((x) => x.severity === "block")).toEqual([]);
    expect(rules(v)).toEqual(["max-same-position"]);
  });
});

describe("pitching limits", () => {
  const grid = withCell(withCell(GRID_9x4, "p1", 3, "P"), "p3", 3, "SS");

  it("blocks more than maxInningsPitched in a game", () => {
    const v = only(
      validateLineup(ROSTER_9, lineupFromGrid(grid), config, []),
      "max-innings-pitched",
    );
    expect(v).toEqual([expect.objectContaining({ playerId: "p1", severity: "block" })]);
  });

  it("allows it when the limit is raised or removed", () => {
    for (const maxInningsPitched of [3, null]) {
      const v = validateLineup(
        ROSTER_9,
        lineupFromGrid(grid),
        resolveRuleConfig({ maxInningsPitched }),
        [],
      );
      expect(only(v, "max-innings-pitched")).toEqual([]);
    }
  });

  it("blocks a catcher who also pitches in the same game", () => {
    // p2 catches innings 1–2, then pitches 3–4.
    const roster = setFlags(ROSTER_9, "p2", { canPitch: true });
    const grid2 = {
      ...GRID_9x4,
      p2: ["C", "C", "P", "P"] as Position[],
      p3: ["1B", "1B", "LF", "LF"] as Position[],
    };
    const v = only(
      validateLineup(roster, lineupFromGrid(grid2), config, []),
      "catcher-cannot-pitch",
    );
    expect(v).toEqual([expect.objectContaining({ playerId: "p2", severity: "block" })]);

    const relaxed = validateLineup(
      roster,
      lineupFromGrid(grid2),
      resolveRuleConfig({ catcherCannotPitch: false }),
      [],
    );
    expect(only(relaxed, "catcher-cannot-pitch")).toEqual([]);
  });
});

describe("season-balance (warn only)", () => {
  // In five earlier games, p7 never played infield and sat a lot; everyone else
  // played their usual infield innings.
  const benchHeavy: Lineup = lineupFromGrid({
    ...GRID_9x4,
    p7: ["BENCH", "BENCH", "BENCH", "BENCH"],
    extra: ["LF", "LF", "1B", "1B"],
  });
  const history = Array.from({ length: 5 }, () => benchHeavy);
  const roster = [...ROSTER_9, makePlayer("extra", { active: false })];

  it("warns when a player is far below average infield and far above average bench", () => {
    const v = only(
      validateLineup(roster, lineupFromGrid(GRID_9x4), config, history),
      "season-balance",
    );
    expect(v.map((x) => x.playerId)).toEqual(["p7", "p7"]);
    expect(v.every((x) => x.severity === "warn")).toBe(true);
  });

  it("is off when the threshold is null", () => {
    const v = validateLineup(
      roster,
      lineupFromGrid(GRID_9x4),
      resolveRuleConfig({ seasonBalanceThreshold: null }),
      history,
    );
    expect(only(v, "season-balance")).toEqual([]);
  });
});

describe("game length", () => {
  it("validates a 4-inning game using only innings 1–4", () => {
    const four = lineupFromGrid(
      Object.fromEntries(Object.entries(GRID_12x6).map(([id, row]) => [id, row.slice(0, 4)])),
    );
    expect(validateLineup(ROSTER_12, four, config, [])).toEqual([]);
  });

  it("flags innings with no slots at all in a 6-inning game", () => {
    const lineup = { ...lineupFromGrid(GRID_9x4), innings: 6 };
    const v = validateLineup(ROSTER_9, lineup, config, []);
    expect([...new Set(only(v, "position-coverage").map((x) => x.inning))]).toEqual([5, 6]);
  });
});

describe("coach's pitch", () => {
  // p1 "pitches" three innings, nobody can pitch, and p2 both catches and pitches.
  const roster = ROSTER_9.map((p) => ({ ...p, canPitch: false }));
  const grid = {
    ...withCell(withCell(GRID_9x4, "p1", 3, "P"), "p3", 3, "SS"),
    p2: ["C", "C", "LF", "P"] as Position[],
    p1: ["P", "P", "P", "SS"] as Position[],
    p3: ["1B", "1B", "SS", "LF"] as Position[],
  };
  const pitching: RuleId[] = ["pitcher-eligibility", "max-innings-pitched", "catcher-cannot-pitch"];

  it("applies pitching rules normally", () => {
    const v = rules(validateLineup(roster, lineupFromGrid(grid), config, []));
    for (const rule of pitching) expect(v).toContain(rule);
  });

  it("treats P as a fielding spot when coachPitch is on", () => {
    const v = validateLineup(
      roster,
      lineupFromGrid(grid),
      resolveRuleConfig({ coachPitch: true }),
      [],
    );
    for (const rule of pitching) expect(only(v, rule)).toEqual([]);
  });
});

describe("players sitting out of the batting order", () => {
  const base = lineupFromGrid(GRID_9x4);
  const order = base.battingOrder.filter((id) => id !== "p9");

  it("are not reported missing", () => {
    const lineup: Lineup = { ...base, battingOrder: order, notBatting: ["p9"] };
    expect(only(validateLineup(ROSTER_9, lineup, config, []), "batting-order")).toEqual([]);
  });

  it("can't also be in the batting order, and must be on the roster", () => {
    const both: Lineup = { ...base, notBatting: ["p9", "ghost"] };
    const v = only(validateLineup(ROSTER_9, both, config, []), "batting-order");
    expect(v.map((x) => x.playerId).sort()).toEqual(["ghost", "p9"]);
  });
});

describe("absent players", () => {
  const roster = [...ROSTER_9, makePlayer("away")];

  it("aren't expected in the field or the batting order", () => {
    const lineup: Lineup = { ...lineupFromGrid(GRID_9x4), absent: ["away"] };
    expect(validateLineup(roster, lineup, config, [])).toEqual([]);
  });

  it("can't be given a position or a batting spot", () => {
    const lineup: Lineup = {
      ...lineupFromGrid({ ...GRID_9x4, away: ["BENCH", "BENCH", "BENCH", "BENCH"] }),
      absent: ["away"],
    };
    const v = validateLineup(roster, lineup, config, []);
    expect(only(v, "invalid-slot")[0]?.message).toContain("absent");
    expect(only(v, "batting-order")[0]?.message).toContain("absent");
  });

  it("don't fall behind on season balance for games they missed", () => {
    // "away" missed five games, then plays a normal game: no catching up owed.
    const history = Array.from({ length: 5 }, () => ({
      ...lineupFromGrid(GRID_9x4),
      absent: ["away"],
    }));
    const grid = { ...GRID_9x4, away: ["BENCH", "LF", "1B", "BENCH"] as Position[] };
    const today = lineupFromGrid({ ...grid, p7: ["LF", "BENCH", "BENCH", "1B"] });
    // Default threshold (3): the old raw-innings rule flagged "away" here (1 vs a 14.4 average).
    const v = validateLineup(roster, today, config, history);
    expect(only(v, "season-balance").map((x) => x.playerId)).not.toContain("away");
  });
});
