import { describe, expect, it } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { SEED_DATA } from "./seed";
import {
  gameContext,
  lastFilledInning,
  splitGames,
  validateGameInput,
  type GameInput,
} from "./game";
import type { AppData, Game } from "./types";

const valid: GameInput = {
  opponent: "Lakeside",
  date: "2026-10-24",
  startTime: "09:00",
  location: "",
  innings: 6,
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
});
