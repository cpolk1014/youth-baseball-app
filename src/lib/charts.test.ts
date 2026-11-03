import { describe, expect, it } from "vitest";
import type { Game } from "@/lib/data/types";
import type { FinanceEntry } from "@/lib/finance/types";
import { makePlayer } from "@/lib/rules/test-utils";
import type { SeasonRow } from "@/lib/season/summary";
import { gameRuns, moneyTimeline, playingTimeBars } from "./charts";

const entry = (over: Partial<FinanceEntry>): FinanceEntry => ({
  id: Math.random().toString(),
  seasonId: "s",
  type: "safe_at_home",
  title: "",
  amountCents: 0,
  date: "2026-09-01",
  category: null,
  payee: null,
  method: null,
  refund: false,
  estimate: false,
  dueDates: [],
  note: null,
  receiptPath: null,
  ...over,
});

describe("moneyTimeline", () => {
  it("adds up money in and out by day, skipping charges, credits and estimates", () => {
    const points = moneyTimeline([
      entry({ type: "bat_around", amountCents: 300000, date: "2026-09-01" }),
      entry({ amountCents: 25000, date: "2026-09-05" }),
      entry({ amountCents: 25000, date: "2026-09-05" }),
      entry({ type: "walkoff", amountCents: 59500, date: "2026-09-10" }),
      entry({ amountCents: 5000, refund: true, date: "2026-09-12" }),
      entry({ type: "grand_slam", amountCents: 80000, date: "2026-09-20" }),
      entry({ type: "walkoff", amountCents: 99999, estimate: true, date: "2026-09-21" }),
      entry({ type: "rain_check", amountCents: 1000, date: "2026-09-22" }),
    ]);
    expect(points).toEqual([
      { date: "2026-09-05", inCents: 50000, outCents: 0 },
      { date: "2026-09-10", inCents: 50000, outCents: 59500 },
      { date: "2026-09-12", inCents: 45000, outCents: 59500 },
      { date: "2026-09-20", inCents: 125000, outCents: 59500 },
    ]);
  });
});

describe("gameRuns", () => {
  const game = (id: string, date: string, us: number | null, them: number | null): Game => ({
    id,
    seasonId: "s",
    date,
    startTime: null,
    opponent: id,
    location: null,
    innings: 6,
    fieldPlayers: 9,
    status: "final",
    scoreUs: us,
    scoreThem: them,
  });

  it("lists scored final games oldest first with their result", () => {
    const runs = gameRuns([
      game("b", "2026-09-08", 2, 5),
      game("a", "2026-09-01", 6, 1),
      game("x", "2026-09-10", null, null),
    ]);
    expect(runs.map((r) => [r.id, r.us, r.them, r.result])).toEqual([
      ["a", 6, 1, "W"],
      ["b", 2, 5, "L"],
    ]);
  });
});

describe("playingTimeBars", () => {
  it("splits field innings into infield and outfield", () => {
    const row: SeasonRow = {
      player: makePlayer("a", { name: "Ava", jerseyNumber: 4 }),
      games: 3,
      field: 14,
      infield: 9,
      bench: 4,
      byPosition: {},
      lowInfield: false,
      highBench: true,
    };
    expect(playingTimeBars([row])).toEqual([
      {
        playerId: "a",
        name: "Ava",
        jerseyNumber: 4,
        infield: 9,
        outfield: 5,
        bench: 4,
        total: 18,
        flagged: true,
      },
    ]);
  });
});
