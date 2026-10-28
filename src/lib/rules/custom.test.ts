import { describe, expect, it } from "vitest";
import { resolveRuleConfig } from "./config";
import { OUTFIELD_GROUP, customRuleProblems, describeCustomRule, rotateLeadoff } from "./custom";
import { generateLineup } from "./generate";
import { GRID_12x6, ROSTER_12, lineupFromGrid, makeRoster } from "./test-utils";
import type { CustomRule, Lineup } from "./types";
import { validateLineup } from "./validate";

const withRules = (custom: CustomRule[]) => resolveRuleConfig({ custom });
const customOnly = (vs: ReturnType<typeof validateLineup>) => vs.filter((v) => v.rule === "custom");
const NINE = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;

describe("custom rules: wording", () => {
  it("reads like a coach would say it", () => {
    const say = (r: CustomRule) => describeCustomRule(r, ROSTER_12);
    expect(
      say({
        id: "1",
        setting: "block",
        kind: "position-min",
        positions: OUTFIELD_GROUP,
        innings: 2,
      }),
    ).toBe("Everyone plays at least 2 innings at the outfield");
    expect(
      say({ id: "2", setting: "block", kind: "position-max", positions: ["C"], innings: 3 }),
    ).toBe("No one plays catcher more than 3 innings");
    expect(
      say({ id: "3", setting: "block", kind: "never-plays", playerId: "e", positions: ["P"] }),
    ).toBe("E never plays pitcher");
    expect(
      say({ id: "4", setting: "block", kind: "locked", playerId: "a", position: "P", inning: 1 }),
    ).toBe("A plays pitcher in the 1st inning");
    expect(say({ id: "5", setting: "warn", kind: "no-repeat-bench", inning: 1 })).toBe(
      "No one sits the 1st inning two games in a row",
    );
    expect(say({ id: "6", setting: "warn", kind: "leadoff-rotation" })).toBe(
      "The leadoff hitter changes every game",
    );
  });
});

describe("custom rules: checking a lineup", () => {
  const grid = lineupFromGrid(GRID_12x6);

  it("flags each rule type, and nothing when the rule is off", () => {
    const rules: CustomRule[] = [
      { id: "max-c", setting: "block", kind: "position-max", positions: ["C"], innings: 1 }, // b, h catch 2
      { id: "never", setting: "warn", kind: "never-plays", playerId: "a", positions: ["P"] }, // a pitches 1–2
      { id: "lock", setting: "block", kind: "locked", playerId: "j", position: "P", inning: 1 }, // j sits 1st
      { id: "off", setting: "off", kind: "position-min", positions: ["RF"], innings: 6 },
    ];
    const v = customOnly(validateLineup(ROSTER_12, grid, withRules(rules), []));
    expect(
      v
        .filter((x) => x.customRuleId === "max-c")
        .map((x) => x.playerId)
        .sort(),
    ).toEqual(["b", "h"]);
    expect(v.filter((x) => x.customRuleId === "never")).toHaveLength(2);
    expect(v.find((x) => x.customRuleId === "never")?.severity).toBe("warn");
    expect(v.filter((x) => x.customRuleId === "lock")).toHaveLength(1);
    expect(v.some((x) => x.customRuleId === "off")).toBe(false);
  });

  it("position minimums use only this game's positions", () => {
    const rule: CustomRule = {
      id: "of",
      setting: "block",
      kind: "position-min",
      positions: OUTFIELD_GROUP,
      innings: 1,
    };
    const v = customOnly(validateLineup(ROSTER_12, grid, withRules([rule]), []));
    // In GRID_12x6, a and c never play the outfield... a plays LF in the 6th. c never does.
    expect(v.map((x) => x.playerId)).toEqual(["c"]);
  });

  it("checks rules across games against the previous game", () => {
    const bench: CustomRule = { id: "b1", setting: "warn", kind: "no-repeat-bench", inning: 1 };
    const lead: CustomRule = { id: "lead", setting: "warn", kind: "leadoff-rotation" };
    const v = customOnly(validateLineup(ROSTER_12, grid, withRules([bench, lead]), [], grid));
    // j, k, l sit the 1st both games; a leads off both.
    expect(
      v
        .filter((x) => x.customRuleId === "b1")
        .map((x) => x.playerId)
        .sort(),
    ).toEqual(["j", "k", "l"]);
    expect(v.filter((x) => x.customRuleId === "lead").map((x) => x.playerId)).toEqual(["a"]);
    expect(customOnly(validateLineup(ROSTER_12, grid, withRules([bench, lead]), []))).toEqual([]);
  });

  it("rotates the leadoff hitter", () => {
    expect(rotateLeadoff(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(rotateLeadoff(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
  });
});

describe("custom rules: auto-fill follows them", () => {
  const roster = makeRoster(12, { pitchers: 4, catchers: 3 });
  const gen = (custom: CustomRule[], previous: Lineup | null = null, seed = 11) =>
    generateLineup(roster, withRules(custom), [], seed, { innings: 6, previous });

  it("locks a player into a spot, keeps others out of positions, and limits innings", () => {
    const rules: CustomRule[] = [
      { id: "lock", setting: "block", kind: "locked", playerId: "p9", position: "SS", inning: 1 },
      {
        id: "never",
        setting: "block",
        kind: "never-plays",
        playerId: "p10",
        positions: ["1B", "2B"],
      },
      { id: "max", setting: "block", kind: "position-max", positions: ["3B"], innings: 1 },
      {
        id: "min",
        setting: "block",
        kind: "position-min",
        positions: ["LF", "CF", "RF"],
        innings: 1,
      },
    ];
    for (const seed of [1, 2, 3]) {
      const { lineup, violations } = gen(rules, null, seed);
      expect(customOnly(violations)).toEqual([]);
      expect(lineup.slots.find((s) => s.inning === 1 && s.playerId === "p9")?.position).toBe("SS");
    }
  });

  it("keeps a player out of pitching when they never pitch", () => {
    const rule: CustomRule = {
      id: "np",
      setting: "block",
      kind: "never-plays",
      playerId: "p1",
      positions: ["P"],
    };
    const { lineup, violations } = gen([rule]);
    expect(lineup.slots.some((s) => s.playerId === "p1" && s.position === "P")).toBe(false);
    expect(violations.filter((v) => v.severity === "block")).toEqual([]);
  });

  it("doesn't sit the same kids in the 1st two games in a row", () => {
    const rule: CustomRule = { id: "b1", setting: "block", kind: "no-repeat-bench", inning: 1 };
    const first = gen([rule], null, 4).lineup;
    const { violations } = gen([rule], first, 5);
    expect(customOnly(violations)).toEqual([]);
  });
});

describe("custom rules: problems before saving", () => {
  const team = {
    players: ROSTER_12,
    innings: 6,
    fieldPositions: [...NINE],
    coachPitch: false,
  };

  it("catches rules the roster can't meet", () => {
    expect(
      customRuleProblems(
        {
          id: "x",
          setting: "block",
          kind: "position-min",
          positions: ["LF", "CF", "RF"],
          innings: 2,
        },
        team,
        [],
      )[0],
    ).toMatch(/24 turns.*only has 18.*Try 1/);
    expect(
      customRuleProblems(
        { id: "x", setting: "block", kind: "position-max", positions: ["C"], innings: 1 },
        team,
        [],
      ),
    ).toEqual([expect.stringMatching(/Only 4 kids can play catcher/)]);
    expect(
      customRuleProblems(
        { id: "x", setting: "block", kind: "locked", playerId: "e", position: "P", inning: 1 },
        team,
        [],
      ),
    ).toEqual(["E isn't marked as able to pitch."]);
  });

  it("catches clashes and repeats, and passes a sensible rule", () => {
    const never: CustomRule = {
      id: "n",
      setting: "block",
      kind: "never-plays",
      playerId: "a",
      positions: ["P"],
    };
    const lock: CustomRule = {
      id: "l",
      setting: "block",
      kind: "locked",
      playerId: "a",
      position: "P",
      inning: 1,
    };
    expect(customRuleProblems(lock, team, [never])[0]).toMatch(
      /clashes with “A never plays pitcher”/,
    );
    expect(customRuleProblems({ ...never, id: "n2" }, team, [never])).toContain(
      "You already have this rule.",
    );
    expect(
      customRuleProblems(
        {
          id: "ok",
          setting: "warn",
          kind: "position-min",
          positions: ["LF", "CF", "RF"],
          innings: 1,
        },
        team,
        [],
      ),
    ).toEqual([]);
  });

  it("explains a rule that does nothing yet", () => {
    const small = { ...team, players: ROSTER_12.slice(0, 9) };
    expect(
      customRuleProblems(
        { id: "b", setting: "warn", kind: "no-repeat-bench", inning: 1 },
        small,
        [],
      )[0],
    ).toMatch(/Nobody sits/);
  });
});
