import { describe, expect, it } from "vitest";
import { matchSchedule, parsePlaceholder, type SavedGame } from "./schedule";
import {
  bracketFills,
  resolveSide,
  seedingMessage,
  seedsFrom,
  standings,
  type SGame,
  type STeam,
} from "./standings";
import { cleanRules, describeCriterion, type Criterion } from "./tiebreak";

const teams: STeam[] = ["Aces", "Bats", "Cubs", "Dogs"].map((n) => ({ id: n[0]!, name: n }));
let n = 0;
const g = (
  home: string,
  away: string,
  score: [number, number] | null,
  over: Partial<SGame> = {},
): SGame => ({
  id: `g${++n}`,
  gameNo: String(n),
  stage: "pool",
  pool: "A",
  home,
  away,
  homeTeamId: null,
  awayTeamId: null,
  scoreHome: score?.[0] ?? null,
  scoreAway: score?.[1] ?? null,
  ...over,
});
const rule = (type: Criterion["type"], cap: number | null = null): Criterion => ({
  type,
  cap,
  text: "",
});
const order = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("standings", () => {
  it("ranks by record first", () => {
    const [t] = standings({
      teams,
      games: [g("Aces", "Bats", [5, 1]), g("Cubs", "Dogs", [2, 3]), g("Aces", "Dogs", [4, 0])],
      rules: [],
      restart: true,
      seeding: "overall",
    });
    expect(order(t!.rows)).toEqual(["Aces", "Dogs", "Bats", "Cubs"]);
    expect(t!.rows[0]).toMatchObject({ w: 2, l: 0, t: 0, rs: 9, ra: 1, seed: 1, decidedBy: null });
    // Bats and Cubs are both 0-1 and nothing breaks it.
    expect(t!.rows[2]).toMatchObject({ seed: 3, seedTo: 4, open: "tied" });
  });

  it("skips head to head when the tied teams didn't all play each other, then uses runs allowed", () => {
    const games = [
      g("Aces", "Bats", [3, 4]),
      g("Aces", "Cubs", [9, 0]),
      g("Bats", "Dogs", [1, 6]),
      g("Cubs", "Dogs", [2, 1]),
    ];
    const [t] = standings({
      teams,
      games,
      rules: [rule("head_to_head"), rule("runs_allowed")],
      restart: true,
      seeding: "overall",
    });
    // Everyone is 1-1.
    expect(t!.rows.every((r) => r.w === 1 && r.l === 1)).toBe(true);
    // Not everyone played everyone, so head to head is skipped; fewest runs allowed decides
    // (Dogs 3, Aces 4, Bats 9, Cubs 10).
    expect(order(t!.rows)).toEqual(["Dogs", "Aces", "Bats", "Cubs"]);
    expect(t!.rows[0]!.decidedBy).toBe("Fewest runs allowed");
  });

  it("uses head to head when the tied teams played each other, and caps run differential", () => {
    const games = [
      g("Aces", "Bats", [2, 1]),
      g("Bats", "Cubs", [20, 0]),
      g("Aces", "Cubs", [0, 1]),
      g("Dogs", "Aces", [0, 1]),
      g("Dogs", "Bats", [0, 1]),
      g("Dogs", "Cubs", [0, 1]),
    ];
    // Aces 2-1, Bats 2-1, Cubs 2-1 (a three-way tie, everyone played everyone, 1-1 each).
    const [t] = standings({
      teams,
      games,
      rules: [rule("head_to_head"), rule("run_diff", 8)],
      restart: true,
      seeding: "overall",
    });
    expect(order(t!.rows)).toEqual(["Bats", "Aces", "Cubs", "Dogs"]);
    // Bats' 20-0 win counts as +8: Bats +8+1-1 = 8... Aces +1-1+1 = 1, Cubs -8+1+1 = -6.
    expect(t!.rows[0]!.decidedBy).toBe("Best run differential (max 8 a game)");
  });

  it("starts over at head to head once a three-way tie is partly broken", () => {
    const games = [
      g("Aces", "Bats", [1, 0]),
      g("Bats", "Cubs", [1, 0]),
      g("Cubs", "Aces", [1, 0]),
      g("Aces", "Dogs", [10, 0]),
      g("Bats", "Dogs", [2, 1]),
      g("Cubs", "Dogs", [2, 1]),
    ];
    // Aces, Bats, Cubs 2-1 and 1-1 against each other. Runs allowed: Aces 1, Bats 2, Cubs 2.
    const rules = [rule("head_to_head"), rule("runs_allowed"), rule("runs_scored")];
    const [restart] = standings({ teams, games, rules, restart: true, seeding: "overall" });
    // Aces out first; Bats beat Cubs head to head.
    expect(order(restart!.rows)).toEqual(["Aces", "Bats", "Cubs", "Dogs"]);
    expect(restart!.rows[1]!.decidedBy).toBe("Head to head");
    const [onward] = standings({ teams, games, rules, restart: false, seeding: "overall" });
    // Without starting over, Bats and Cubs go on to runs scored: Bats 3, Cubs 3 → still tied.
    expect(onward!.rows[1]).toMatchObject({ seed: 2, seedTo: 3, open: "tied" });
  });

  it("calls an unbreakable tie a coin flip when the rules end with one", () => {
    const [t] = standings({
      teams,
      games: [g("Aces", "Bats", [1, 0]), g("Cubs", "Dogs", [1, 0])],
      rules: [rule("runs_allowed"), rule("coin_flip")],
      restart: true,
      seeding: "overall",
    });
    expect(t!.rows[0]).toMatchObject({ seed: 1, seedTo: 2, open: "coin" });
  });

  it("counts teams on the schedule that aren't on the tournament's team list", () => {
    const [t] = standings({
      teams: teams.slice(0, 1),
      games: [g("Aces", "Bats", [5, 1]), g("Cubs", "Seed 4", [2, 3])],
      rules: [],
      restart: true,
      seeding: "overall",
    });
    // Bats is only on the schedule; "Seed 4" is a placeholder, so that game doesn't count.
    expect(order(t!.rows)).toEqual(["Aces", "Bats"]);
    expect(t!.rows[1]!.teamId).toBe("name:bats");
  });

  it("seeds within each pool", () => {
    const tables = standings({
      teams,
      games: [g("Aces", "Bats", [5, 1]), g("Cubs", "Dogs", [2, 3], { pool: "B" })],
      rules: [],
      restart: true,
      seeding: "pool",
    });
    expect(tables.map((t) => [t.pool, order(t.rows)])).toEqual([
      ["A", ["Aces", "Bats"]],
      ["B", ["Dogs", "Cubs"]],
    ]);
  });

  it("treats a what-if pick as a win with runs unknown", () => {
    const games = [g("Aces", "Bats", [5, 1]), g("Cubs", "Dogs", null)];
    const [t] = standings({
      teams,
      games,
      rules: [rule("runs_allowed")],
      restart: true,
      seeding: "overall",
      picks: new Map([[games[1]!.id, "home"]]),
    });
    // Aces and Cubs are both 1-0; runs allowed can't be known for Cubs yet.
    expect(t!.rows[0]).toMatchObject({ seed: 1, seedTo: 2, open: "runs" });
    expect(t!.rows.find((r) => r.name === "Cubs")!.rs).toBeNull();
  });
});

describe("the bracket", () => {
  it("reads placeholders", () => {
    expect(parsePlaceholder("Seed 3")).toEqual({ kind: "seed", n: 3 });
    expect(parsePlaceholder("3rd Seed")).toEqual({ kind: "seed", n: 3 });
    expect(parsePlaceholder("#10")).toEqual({ kind: "seed", n: 10 });
    expect(parsePlaceholder("8")).toEqual({ kind: "seed", n: 8 });
    expect(parsePlaceholder("1st Pool A")).toEqual({ kind: "pool", pool: "A", n: 1 });
    expect(parsePlaceholder("Pool B #2")).toEqual({ kind: "pool", pool: "B", n: 2 });
    expect(parsePlaceholder("A1")).toEqual({ kind: "pool", pool: "A", n: 1 });
    expect(parsePlaceholder("Winner Game 7")).toEqual({ kind: "winner", gameNo: "7" });
    expect(parsePlaceholder("W7")).toEqual({ kind: "winner", gameNo: "7" });
    expect(parsePlaceholder("Loser of G5")).toEqual({ kind: "loser", gameNo: "5" });
    expect(parsePlaceholder("Bomb Squad")).toBeNull();
    expect(parsePlaceholder("Team Louisiana Navy")).toBeNull();
  });

  it("fills seeds and winners into bracket games", () => {
    const seeds = [
      { teamId: "A", name: "Aces", seed: 1, pool: null },
      { teamId: "B", name: "Bats", seed: 2, pool: null },
      { teamId: "C", name: "Cubs", seed: 3, pool: null },
    ];
    const games = [
      g("Seed 2", "Seed 3", [4, 6], { stage: "bracket", gameNo: "5" }),
      g("Seed 1", "Winner Game 5", null, { stage: "bracket", gameNo: "6" }),
    ];
    expect(resolveSide("Winner Game 5", seeds, games)).toBe("Cubs");
    expect(resolveSide("Loser G5", seeds, games)).toBe("Bats");
    expect(bracketFills(games, seeds)).toEqual([
      { id: games[0]!.id, home: "Bats", away: "Cubs" },
      { id: games[1]!.id, home: "Aces", away: "Cubs" },
    ]);
    // Overall seeds don't answer pool placeholders.
    expect(resolveSide("1st Pool A", seeds, games)).toBeNull();
  });

  it("keeps filled-in bracket teams when an updated schedule still shows placeholders", () => {
    const saved: SavedGame = {
      id: "s1",
      gameId: null,
      gameNo: "5",
      stage: "bracket",
      pool: null,
      round: null,
      date: "2026-11-15",
      startTime: "12:30",
      venue: null,
      field: "OV #6",
      home: "Aces",
      away: "Winner Game 1",
    };
    const m = matchSchedule(
      [saved],
      [{ ...saved, home: "Seed 1", away: "Winner Game 1", startTime: "13:00" }],
    );
    expect(m.changed[0]!.next.home).toBe("Aces");
    expect(m.changed[0]!.changes).toEqual(["now 1:00 PM"]);
  });

  it("writes the GroupMe post", () => {
    const tables = standings({
      teams,
      games: [g("Aces", "Bats", [5, 1]), g("Cubs", "Aces", [2, 3])],
      rules: [],
      restart: true,
      seeding: "overall",
    });
    const text = seedingMessage({
      tournament: "Fall Classic",
      seeds: seedsFrom(tables),
      rows: tables[0]!.rows,
      ourId: "A",
      next: { when: "Sun 10:45 AM", place: "OV #6", opponent: "Cubs" },
    });
    expect(text).toBe(
      [
        "Pool play is done at Fall Classic!",
        "We're the 1st seed (2-0).",
        "Next: Sun 10:45 AM at OV #6 vs Cubs.",
        "",
        "Seeds:",
        "1. Aces",
        "2. Bats",
        "3. Cubs",
      ].join("\n"),
    );
  });
});

describe("tie-break rules", () => {
  it("keeps known criteria once, caps only run criteria, and puts a coin flip last", () => {
    const r = cleanRules({
      organization: " 2D Sports ",
      criteria: [
        { type: "coin_flip", cap: null, text: "Coin toss" },
        { type: "head_to_head", cap: 5, text: "Head-to-head" },
        { type: "run_diff", cap: 8, text: "Run differential, max 8" },
        { type: "run_diff", cap: 8, text: "again" },
        { type: "batting_avg", cap: null, text: "?" },
      ],
      restart: true,
      seeding: "overall",
      notes: null,
      warnings: [],
    });
    expect(r.organization).toBe("2D Sports");
    expect(r.rules.map((c) => [c.type, c.cap])).toEqual([
      ["head_to_head", null],
      ["run_diff", 8],
      ["coin_flip", null],
    ]);
    expect(describeCriterion(r.rules[1]!)).toBe("Best run differential (max 8 a game)");
    expect(cleanRules(null)).toMatchObject({ rules: [], restart: true, seeding: null });
  });
});
