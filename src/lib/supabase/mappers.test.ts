import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import {
  appDataFromRows,
  gameFromRow,
  gameToRow,
  lineupToRpcArgs,
  playerFromRow,
  playerToRow,
  type TeamRows,
} from "./mappers";
import type { GameRow } from "./rows";

const gameRow: GameRow = {
  id: "g1",
  season_id: "s1",
  game_date: "2026-10-24",
  start_time: "09:00:00",
  opponent: "Lakeside",
  location: null,
  innings: 4,
  field_players: 10,
  status: "scheduled",
};

describe("supabase mappers", () => {
  it("round-trips players", () => {
    for (const p of SEED_DATA.players) {
      expect(playerFromRow(playerToRow(p, "t1"))).toEqual(p);
    }
  });

  it("maps games, trimming seconds from start times", () => {
    const g = gameFromRow(gameRow);
    expect(g.startTime).toBe("09:00");
    expect(gameFromRow({ ...gameRow, start_time: null }).startTime).toBeNull();
    expect(gameToRow(g)).toEqual({ ...gameRow, start_time: "09:00" });
  });

  it("builds save_lineup arguments in snake_case", () => {
    const args = lineupToRpcArgs("g1", {
      innings: 4,
      battingOrder: ["a"],
      notBatting: ["b"],
      slots: [{ inning: 1, playerId: "a", position: "P" }],
    });
    expect(args).toEqual({
      p_game_id: "g1",
      p_batting_order: ["a"],
      p_not_batting: ["b"],
      p_slots: [{ inning: 1, player_id: "a", position: "P" }],
    });
  });

  it("builds app data from rows using each game's highest lineup version", () => {
    const rows: TeamRows = {
      team: { id: "t1", name: "Rattlers", age_group: "10U", coach_pitch: true },
      season: { id: "s1", team_id: "t1", name: "Fall", fair_play_rules: { maxInningsPitched: 3 } },
      players: [playerToRow(SEED_DATA.players[0]!, "t1")],
      games: [gameRow, { ...gameRow, id: "g2" }],
      lineups: [
        { id: "l1", game_id: "g1", batting_order: ["old"], not_batting: [], version: 1 },
        { id: "l2", game_id: "g1", batting_order: ["p"], not_batting: ["x"], version: 2 },
      ],
      slots: [
        { lineup_id: "l1", inning: 1, player_id: "old", position: "C" },
        { lineup_id: "l2", inning: 1, player_id: "p", position: "P" },
      ],
    };
    const data = appDataFromRows(rows, { g1: 3 });
    expect(data.team).toEqual({ id: "t1", name: "Rattlers", ageGroup: "10U", coachPitch: true });
    expect(data.games[0]?.fieldPlayers).toBe(10);
    expect(data.season.fairPlayRules).toEqual({ maxInningsPitched: 3 });
    expect(data.lineups.g1).toEqual({
      innings: 4,
      battingOrder: ["p"],
      notBatting: ["x"],
      slots: [{ inning: 1, playerId: "p", position: "P" }],
      autoFillSeed: 3,
    });
    expect(data.lineups.g2).toBeUndefined();
  });
});
