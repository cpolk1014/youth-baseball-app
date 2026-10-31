import { describe, expect, it } from "vitest";
import { competitivePlan, type StatLine } from "./competitive";
import { fieldPositionsFor, resolveRuleConfig } from "./config";
import { generateLineup } from "./generate";
import { computeParticipation } from "./participation";
import { lineupFromGrid, makePlayer, makeRoster } from "./test-utils";
import type { Lineup, Player, Position } from "./types";
import { validateLineup } from "./validate";

const config = resolveRuleConfig();

function positionsOf(lineup: Lineup, playerId: string): Position[] {
  return lineup.slots
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.inning - b.inning)
    .map((s) => s.position);
}

function blocks(roster: Player[], lineup: Lineup, history: Lineup[] = []) {
  return validateLineup(roster, lineup, config, history).filter((v) => v.severity === "block");
}

describe("generateLineup", () => {
  const sizes = [9, 10, 11, 12, 13];
  const lengths = [4, 6];

  describe.each(lengths)("%i-inning game", (innings) => {
    it.each(sizes)("%i players: a complete lineup with zero violations", (n) => {
      const roster = makeRoster(n);
      const { lineup, violations } = generateLineup(roster, config, [], 42, { innings });
      expect(lineup.innings).toBe(innings);
      expect(lineup.slots).toHaveLength(n * innings);
      expect(lineup.battingOrder.slice().sort()).toEqual(roster.map((p) => p.id).sort());
      expect(violations).toEqual([]);
      // The returned violations are exactly what the validator reports.
      expect(validateLineup(roster, lineup, config, [])).toEqual(violations);
    });
  });

  it("is deterministic for a given seed", () => {
    const roster = makeRoster(12);
    const a = generateLineup(roster, config, [], 7, { innings: 6 });
    const b = generateLineup(roster, config, [], 7, { innings: 6 });
    expect(a).toEqual(b);
  });

  it("varies with the seed", () => {
    const roster = makeRoster(12);
    const lineups = [1, 2, 3, 4, 5].map((seed) =>
      JSON.stringify(generateLineup(roster, config, [], seed, { innings: 6 }).lineup),
    );
    expect(new Set(lineups).size).toBeGreaterThan(1);
  });

  it("benches nobody with exactly 9 players", () => {
    const { lineup } = generateLineup(makeRoster(9), config, [], 1, { innings: 6 });
    expect(lineup.slots.filter((s) => s.position === "BENCH")).toEqual([]);
  });

  it("leaves inactive players out", () => {
    const roster = [...makeRoster(10), makePlayer("hurt", { active: false, canPitch: true })];
    const { lineup, violations } = generateLineup(roster, config, [], 1, { innings: 6 });
    expect(positionsOf(lineup, "hurt")).toEqual([]);
    expect(lineup.battingOrder).not.toContain("hurt");
    expect(violations).toEqual([]);
  });

  it("handles players with no preferred positions alongside players with them", () => {
    const roster = makeRoster(11).map((p) =>
      p.id === "p8" ? { ...p, preferredPositions: ["SS" as const] } : p,
    );
    const { lineup, violations } = generateLineup(roster, config, [], 3, { innings: 6 });
    expect(violations).toEqual([]);
    expect(positionsOf(lineup, "p8")).toContain("SS");
    expect(positionsOf(lineup, "p9").filter((p) => p !== "BENCH").length).toBeGreaterThan(0);
  });

  it("uses the only catcher every inning without blocking", () => {
    const roster = makeRoster(12, { pitchers: 4, catchers: 1 });
    const { lineup, violations } = generateLineup(roster, config, [], 5, { innings: 6 });
    expect(violations.filter((v) => v.severity === "block")).toEqual([]);
    expect(positionsOf(lineup, "p5")).toEqual(["C", "C", "C", "C", "C", "C"]);
  });

  it("doesn't make the only catcher pitch, even if they can", () => {
    const roster = makeRoster(10, { pitchers: 2, catchers: 0 }).map((p) =>
      p.id === "p3" ? { ...p, canPitch: true, canCatch: true } : p,
    );
    for (const innings of [4, 6]) {
      const { lineup } = generateLineup(roster, config, [], 9, { innings });
      expect(positionsOf(lineup, "p3")).not.toContain("P");
      expect(blocks(roster, lineup).filter((v) => v.rule !== "max-innings-pitched")).toEqual([]);
    }
  });

  it("supports a 10-fielder config", () => {
    const ten = resolveRuleConfig({
      fieldPositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"],
    });
    const roster = makeRoster(12);
    const { lineup, violations } = generateLineup(roster, ten, [], 11, { innings: 6 });
    expect(violations).toEqual([]);
    expect(lineup.slots.filter((s) => s.position === "BENCH")).toHaveLength(12);
  });

  it("uses season history to even out infield and bench time", () => {
    const roster = makeRoster(12);
    const others = roster.map((p) => p.id).filter((id) => id !== "p10" && id !== "p11");
    // Six earlier games: p10 always in the outfield, p11 on the bench a lot.
    const game = lineupFromGrid({
      ...Object.fromEntries(
        others.map((id) => [id, ["SS", "SS", "SS", "BENCH", "LF", "LF"] as Position[]]),
      ),
      p10: ["LF", "LF", "LF", "LF", "LF", "LF"],
      p11: ["BENCH", "BENCH", "BENCH", "BENCH", "LF", "LF"],
    });
    const history = Array.from({ length: 6 }, () => game);

    const { lineup } = generateLineup(roster, config, history, 13, { innings: 6 });
    expect(blocks(roster, lineup, history)).toEqual([]);
    const thisGame = computeParticipation([lineup], config.infieldPositions);
    const infield = roster.map((p) => thisGame[p.id]?.infield ?? 0);
    expect(thisGame.p10?.infield).toBe(Math.max(...infield));
    expect(thisGame.p11?.bench).toBe(1);
  });

  it("reports blocks instead of throwing when the roster can't satisfy the rules", () => {
    const roster = makeRoster(10, { pitchers: 3, catchers: 0 });
    const { lineup, violations } = generateLineup(roster, config, [], 1, { innings: 6 });
    expect(lineup.slots).toHaveLength(60);
    expect(violations.map((v) => v.rule)).toContain("catcher-eligibility");
  });
});

describe("generateLineup across many seeds", () => {
  it("never produces a block for 9–13 players over 4 and 6 innings", () => {
    for (let n = 9; n <= 13; n++) {
      const roster = makeRoster(n, { pitchers: 3, catchers: 2 });
      for (const innings of [4, 6]) {
        for (let seed = 1; seed <= 15; seed++) {
          const { violations } = generateLineup(roster, config, [], seed, { innings });
          const blocking = violations.filter((v) => v.severity === "block");
          expect(blocking, `n=${n} innings=${innings} seed=${seed}`).toEqual([]);
        }
      }
    }
    // 150 full generations: a few seconds normally, longer on a busy machine.
  }, 60_000);
});

describe("generateLineup for coach's pitch and 10 fielders", () => {
  const coachPitch10 = resolveRuleConfig({
    coachPitch: true,
    fieldPositions: fieldPositionsFor(10),
  });

  it("fills LF, LCF, RCF, RF and puts anyone at P, with zero violations", () => {
    for (const n of [10, 11, 12, 13]) {
      for (const innings of [4, 6]) {
        const roster = makeRoster(n, { pitchers: 0, catchers: 3 });
        const { lineup, violations } = generateLineup(roster, coachPitch10, [], 4, { innings });
        expect(violations, `n=${n} innings=${innings}`).toEqual([]);
        const used = new Set(lineup.slots.map((s) => s.position));
        for (const pos of ["LF", "LCF", "RCF", "RF", "P"] as const) expect(used).toContain(pos);
        expect(used).not.toContain("CF");
      }
    }
  });

  it("spreads P around like any other position", () => {
    const roster = makeRoster(12, { pitchers: 0, catchers: 2 });
    const { lineup } = generateLineup(roster, coachPitch10, [], 8, { innings: 6 });
    const pitchers = new Set(lineup.slots.filter((s) => s.position === "P").map((s) => s.playerId));
    expect(pitchers.size).toBeGreaterThanOrEqual(3);
  });
});

describe("generateLineup follows the coach's rule settings", () => {
  it("gives everyone outfield time when min outfield is on", () => {
    const on = resolveRuleConfig({ severity: { "min-outfield": "block" } });
    for (const n of [10, 12, 13]) {
      const roster = makeRoster(n);
      const { violations } = generateLineup(roster, on, [], 7, { innings: 6 });
      expect(violations.filter((v) => v.rule === "min-outfield")).toEqual([]);
    }
  });

  it("rests last game's pitchers when pitcher rest is on", () => {
    const on = resolveRuleConfig({ severity: { "pitcher-rest": "block" } });
    const roster = makeRoster(12, { pitchers: 6 });
    const previous = generateLineup(roster, on, [], 1, { innings: 6 }).lineup;
    const threw = new Set(previous.slots.filter((s) => s.position === "P").map((s) => s.playerId));
    const { lineup, violations } = generateLineup(roster, on, [], 2, { innings: 6, previous });
    const pitchingNow = lineup.slots.filter((s) => s.position === "P").map((s) => s.playerId);
    expect(pitchingNow.some((id) => threw.has(id))).toBe(false);
    expect(violations.filter((v) => v.severity === "block")).toEqual([]);
  });

  it("lets anyone catch when catcher eligibility is off", () => {
    const off = resolveRuleConfig({ severity: { "catcher-eligibility": "off" } });
    const roster = makeRoster(11, { pitchers: 4, catchers: 0 });
    const { violations } = generateLineup(roster, off, [], 3, { innings: 6 });
    expect(violations.filter((v) => v.severity === "block")).toEqual([]);
  });

  it("keeps every kid in at least half the game", () => {
    const roster = makeRoster(14);
    const { violations } = generateLineup(roster, config, [], 5, { innings: 6 });
    expect(violations.filter((v) => v.rule === "min-innings-played")).toEqual([]);
  });
});

describe("generateLineup, competitive", () => {
  const roster = makeRoster(12);
  // Stats: the first player is the best at everything, the last the weakest.
  const lines = new Map<string, StatLine>(
    roster.map((p, i) => {
      const q = 1 - i / roster.length;
      return [
        p.id,
        {
          pa: 60,
          obp: 0.25 + 0.3 * q,
          slg: 0.25 + 0.4 * q,
          ops: 0.5 + 0.7 * q,
          ip: p.canPitch ? 20 : 0,
          whip: p.canPitch ? 3 - 2 * q : null,
          era: null,
          fpct: 0.7 + 0.25 * q,
          chances: 40,
          innings: i === 3 ? { SS: 100 } : { LF: 10 },
        },
      ];
    }),
  );
  const plan = competitivePlan(roster, lines);
  const build = (seed = 7) =>
    generateLineup(roster, config, [], seed, { innings: 6, competitive: plan }).lineup;

  it("still follows every Must rule, and is deterministic", () => {
    const lineup = build();
    expect(blocks(roster, lineup)).toEqual([]);
    expect(build()).toEqual(lineup);
  });

  it("bats by the stats", () => {
    expect(build().battingOrder).toEqual(plan.battingOrder);
  });

  it("starts the best pitcher, plays the shortstop at SS, and sits the weakest the most", () => {
    const lineup = build();
    const pitchers = roster.filter((p) => p.canPitch).map((p) => p.id);
    const bestPitcher = pitchers.reduce((a, b) =>
      plan.pitching.get(a)! >= plan.pitching.get(b)! ? a : b,
    );
    expect(positionsOf(lineup, bestPitcher)[0]).toBe("P");
    expect(positionsOf(lineup, roster[3]!.id).filter((p) => p === "SS").length).toBeGreaterThan(0);
    const sits = (id: string) => positionsOf(lineup, id).filter((p) => p === "BENCH").length;
    const strong = roster.slice(0, 3).reduce((s, p) => s + sits(p.id), 0);
    const weak = roster.slice(-3).reduce((s, p) => s + sits(p.id), 0);
    expect(weak).toBeGreaterThan(strong);
  });

  it("sets Warn rules aside but keeps Must ones", () => {
    const strict = resolveRuleConfig({
      severity: { "max-same-position": "block", "season-balance": "warn" },
    });
    const { lineup } = generateLineup(roster, strict, [], 7, { innings: 6, competitive: plan });
    const fails = validateLineup(roster, lineup, strict, []).filter((v) => v.severity === "block");
    expect(fails).toEqual([]);
  });
});
