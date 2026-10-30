import { describe, expect, it } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { SEED_DATA } from "./seed";
import {
  defaultFieldPlayers,
  gameContext,
  gameResult,
  lastFilledInning,
  recordText,
  splitGames,
  type GameInput,
  validateGameInput,
  whenText,
} from "./game";
import type { AppData, Game } from "./types";

const valid: GameInput = {
  opponent: "Lakeside",
  date: "2026-10-24",
  startTime: "09:00",
  location: "",
  innings: 6,
  fieldPlayers: 9,
};

describe("validateGameInput", () => {
  it("accepts a valid game, with or without a start time", () => {
    expect(validateGameInput(valid)).toEqual({});
    expect(validateGameInput({ ...valid, startTime: "" })).toEqual({});
  });

  it("requires an opponent and a real date", () => {
    const errors = validateGameInput({ ...valid, opponent: "  ", date: "2026-02-30" });
    expect(Object.keys(errors).sort()).toEqual(["date", "opponent"]);
    expect(validateGameInput({ ...valid, date: "" }).date).toBeDefined();
  });

  it("rejects bad times and innings outside 1–9", () => {
    expect(validateGameInput({ ...valid, startTime: "25:00" }).startTime).toBeDefined();
    expect(validateGameInput({ ...valid, innings: 0 }).innings).toBeDefined();
    expect(validateGameInput({ ...valid, innings: 10 }).innings).toBeDefined();
    expect(validateGameInput({ ...valid, fieldPlayers: 8 }).fieldPlayers).toBeDefined();
    expect(validateGameInput({ ...valid, fieldPlayers: 10 })).toEqual({});
  });
});

describe("game helpers", () => {
  const game = (
    id: string,
    date: string,
    status: Game["status"],
    startTime: string | null = null,
  ): Game => ({
    id,
    seasonId: "s",
    date,
    startTime,
    opponent: id,
    location: null,
    innings: 6,
    fieldPlayers: 9,
    status,
  });

  it("splits upcoming (soonest first) from final (latest first)", () => {
    const { upcoming, final } = splitGames([
      game("b", "2026-10-25", "scheduled"),
      game("a", "2026-10-24", "scheduled", "13:00"),
      game("a0", "2026-10-24", "scheduled", "09:00"),
      game("old", "2026-09-01", "final"),
      game("newer", "2026-10-01", "final"),
    ]);
    expect(upcoming.map((g) => g.id)).toEqual(["a0", "a", "b"]);
    expect(final.map((g) => g.id)).toEqual(["newer", "old"]);
  });

  it("finds the last inning with saved positions", () => {
    expect(lastFilledInning(undefined)).toBe(0);
    expect(lastFilledInning(lineupFromGrid({ a: ["P", "C", "SS"] }))).toBe(3);
  });

  it("uses only other final games of the season as history", () => {
    const [g1, g2] = SEED_DATA.games;
    const lineup = { ...lineupFromGrid({ x: ["P"] }), autoFillSeed: 0 };
    const data: AppData = {
      ...SEED_DATA,
      games: [{ ...g1!, status: "final" }, g2!],
      lineups: { [g1!.id]: lineup, [g2!.id]: lineup },
    };
    expect(gameContext(data, g2!.id)?.history).toHaveLength(1);
    expect(gameContext(data, g1!.id)?.history).toHaveLength(0);
  });

  it("defaults to 10 fielders for coach's pitch and 9 otherwise", () => {
    expect(defaultFieldPlayers(true)).toBe(10);
    expect(defaultFieldPlayers(false)).toBe(9);
  });

  it("uses the game's field players and the team's coach's pitch for its rules", () => {
    const [g1] = SEED_DATA.games;
    const data: AppData = {
      ...SEED_DATA,
      team: { ...SEED_DATA.team, coachPitch: true },
      games: [{ ...g1!, fieldPlayers: 10 }],
    };
    const config = gameContext(data, g1!.id)!.config;
    expect(config.coachPitch).toBe(true);
    expect(config.fieldPositions).toContain("LCF");
    expect(config.fieldPositions).not.toContain("CF");
  });
});

describe("results and record", () => {
  const g = (extra: Partial<Game>): Game => ({
    id: "g",
    seasonId: "s",
    date: "2026-10-24",
    startTime: null,
    opponent: "X",
    location: null,
    innings: 6,
    fieldPlayers: 9,
    status: "final",
    ...extra,
  });

  it("gives W, L or T only for final games with both scores", () => {
    expect(gameResult(g({ scoreUs: 7, scoreThem: 4 }))).toBe("W");
    expect(gameResult(g({ scoreUs: 3, scoreThem: 5 }))).toBe("L");
    expect(gameResult(g({ scoreUs: 2, scoreThem: 2 }))).toBe("T");
    expect(gameResult(g({ scoreUs: 7, scoreThem: null }))).toBeNull();
    expect(gameResult(g({ status: "scheduled", scoreUs: 7, scoreThem: 4 }))).toBeNull();
  });

  it("adds up the season record", () => {
    expect(
      recordText([
        g({ scoreUs: 7, scoreThem: 4 }),
        g({ scoreUs: 1, scoreThem: 4 }),
        g({ scoreUs: 9, scoreThem: 0 }),
      ]),
    ).toBe("2–1");
    expect(recordText([g({ scoreUs: 2, scoreThem: 2 }), g({ scoreUs: 3, scoreThem: 1 })])).toBe(
      "1–0–1",
    );
    expect(recordText([g({})])).toBeNull();
  });

  it("says when a game is", () => {
    expect(whenText("2026-10-29", "2026-10-29")).toBe("Today");
    expect(whenText("2026-10-30", "2026-10-29")).toBe("Tomorrow");
    expect(whenText("2026-10-31", "2026-10-29")).toBe("Saturday");
    expect(whenText("2026-11-14", "2026-10-29")).toBe("Sat, Nov 14");
  });
});
