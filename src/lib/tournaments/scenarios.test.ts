import { describe, expect, it } from "vitest";
import { bySlot, describeTerm, firstGameForSeed, scenarios } from "./scenarios";
import type { SGame, STeam, StandingsInput } from "./standings";
import type { Criterion } from "./tiebreak";

const teams: STeam[] = ["Aces", "Bats", "Cubs", "Dogs"].map((n) => ({ id: n[0]!, name: n }));
const g = (
  id: string,
  home: string,
  away: string,
  score: [number, number] | null,
  over: Partial<SGame & { date: string | null; startTime: string | null }> = {},
) => ({
  id,
  gameNo: id.slice(1),
  stage: "pool" as const,
  pool: "A",
  home,
  away,
  homeTeamId: null,
  awayTeamId: null,
  scoreHome: score?.[0] ?? null,
  scoreAway: score?.[1] ?? null,
  date: "2026-11-14",
  startTime: "09:00",
  ...over,
});
const rule = (type: Criterion["type"], cap: number | null = null): Criterion => ({
  type,
  cap,
  text: "",
});
const input = (games: SGame[], rules: Criterion[]): StandingsInput => ({
  teams,
  games,
  rules,
  restart: true,
  seeding: "overall",
});
const words = (i: StandingsInput, o: ReturnType<typeof scenarios>) =>
  o.outcomes.map((x) => [
    x.seedTo > x.seed ? `${x.seed}-${x.seedTo}` : String(x.seed),
    x.terms.map((t) => describeTerm(t, i.games, i, "A")),
  ]);

describe("what time do we play tomorrow", () => {
  it("lists only the seeds still possible, dropping games that don't matter", () => {
    const i = input(
      [
        g("g1", "Aces", "Cubs", [5, 1]),
        g("g2", "Bats", "Dogs", [4, 2]),
        g("g3", "Aces", "Bats", null),
        g("g4", "Cubs", "Dogs", null),
      ],
      [rule("head_to_head")],
    );
    const o = scenarios(i, "A");
    expect(o.remaining).toBe(2);
    expect(words(i, o)).toEqual([
      ["1", ["We beat Bats"]],
      ["2", ["We lose to Bats, and Cubs beat Dogs"]],
      // We didn't play Dogs, so head to head can't settle it and nothing else does.
      ["2-3", ["We lose to Bats, and Dogs beat Cubs"]],
    ]);
  });

  it("works out the run margin when run differential decides", () => {
    const i = input(
      [g("g1", "Bats", "Cubs", [10, 0]), g("g2", "Aces", "Cubs", null)],
      [rule("run_diff")],
    );
    expect(words(i, scenarios(i, "A"))).toEqual([
      ["1", ["We beat Cubs by 11 or more runs"]],
      ["1-2", ["We beat Cubs by exactly 10 runs"]],
      ["2", ["We beat Cubs by 1 to 9 runs"]],
      ["3", ["We lose to Cubs"]],
    ]);
  });

  it("caps the margin when the rules do", () => {
    const i = input(
      [g("g1", "Bats", "Cubs", [10, 0]), g("g2", "Aces", "Cubs", null)],
      [rule("run_diff", 6), rule("coin_flip")],
    );
    // Both count +6 at most: winning by 6 or more ties, then a coin flip.
    expect(words(i, scenarios(i, "A")).slice(0, 2)).toEqual([
      ["1-2", ["We beat Cubs by 6 or more runs"]],
      ["2", ["We beat Cubs by 1 to 5 runs"]],
    ]);
  });

  it("says the result is settled once pool play is over", () => {
    const i = input([g("g1", "Aces", "Bats", [3, 2])], []);
    expect(words(i, scenarios(i, "A"))).toEqual([["1", ["No matter what happens"]]]);
  });

  it("gives up early in the tournament", () => {
    const games = Array.from({ length: 11 }, (_, k) => g(`g${k}`, "Aces", "Bats", null));
    expect(scenarios(input(games, []), "A")).toMatchObject({ tooMany: true, remaining: 11 });
  });

  it("finds each seed's first bracket game", () => {
    const games = [
      g("b1", "Seed 1", "Winner Game 3", null, { stage: "bracket", startTime: "12:30" }),
      g("b3", "Seed 4", "Seed 5", null, { stage: "bracket", startTime: "10:45" }),
      g("b4", "1st Pool A", "2nd Pool B", null, { stage: "bracket", startTime: "09:00" }),
    ];
    expect(firstGameForSeed(games, 4, null)).toMatchObject({
      game: { id: "b3" },
      opponent: "Seed 5",
    });
    expect(firstGameForSeed(games, 1, null)?.opponent).toBe("Winner Game 3");
    expect(firstGameForSeed(games, 2, "B")?.game.id).toBe("b4");
    expect(firstGameForSeed(games, 9, null)).toBeNull();
  });
});

describe("grouped for parents", () => {
  const pool = () => [g("g1", "Aces", "Cubs", [5, 1]), g("g2", "Bats", "Dogs", [4, 2])];

  it("puts our own game first in a condition", () => {
    const i = input(
      [...pool(), g("g3", "Cubs", "Dogs", null), g("g4", "Aces", "Bats", null)],
      [rule("head_to_head")],
    );
    expect(words(i, scenarios(i, "A"))[1]).toEqual(["2", ["We lose to Bats, and Cubs beat Dogs"]]);
  });

  it("groups seeds that share a bracket game, earliest first", () => {
    const i = input(
      [...pool(), g("g3", "Aces", "Bats", null), g("g4", "Cubs", "Dogs", null)],
      [rule("head_to_head")],
    );
    const games = [
      ...i.games.map((x) => ({ ...x, date: "2026-11-14", startTime: "09:00" })),
      g("b1", "2", "3", null, { stage: "bracket", date: "2026-11-15", startTime: "09:00" }),
      g("b2", "1", "4", null, { stage: "bracket", date: "2026-11-15", startTime: "11:00" }),
    ];
    const slots = bySlot(scenarios(i, "A").outcomes, games, null);
    expect(slots.map((s) => [s.game?.id ?? null, s.seeds, s.opponent, s.coin])).toEqual([
      ["b1", [2, 3], null, true],
      ["b2", [1], "4", false],
    ]);
  });
});
