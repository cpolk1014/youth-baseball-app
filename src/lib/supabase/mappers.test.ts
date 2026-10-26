import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import {
  activeInvites,
  appDataFromRows,
  gameFromRow,
  gameToRow,
  lineupToRpcArgs,
  playerFromRow,
  playerToRow,
  summarizeMyTeams,
  type TeamRows,
} from "./mappers";
import type { GameRow, InviteRow } from "./rows";

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
      absent: ["c"],
      slots: [{ inning: 1, playerId: "a", position: "P" }],
    });
    expect(args).toEqual({
      p_game_id: "g1",
      p_batting_order: ["a"],
      p_not_batting: ["b"],
      p_absent: ["c"],
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
        {
          id: "l1",
          game_id: "g1",
          batting_order: ["old"],
          not_batting: [],
          absent: [],
          version: 1,
        },
        {
          id: "l2",
          game_id: "g1",
          batting_order: ["p"],
          not_batting: ["x"],
          absent: ["y"],
          version: 2,
        },
      ],
      slots: [
        { lineup_id: "l1", inning: 1, player_id: "old", position: "C" },
        { lineup_id: "l2", inning: 1, player_id: "p", position: "P" },
      ],
      members: [
        { id: "m1", team_id: "t1", user_id: "me", role: "parent", display_name: "Sam's mom" },
        { id: "m2", team_id: "t1", user_id: "me", role: "coach", display_name: null },
        { id: "m3", team_id: "t1", user_id: "other", role: "parent", display_name: "Leo's dad" },
      ],
      invites: [],
      userId: "me",
      myTeams: [],
    };
    const data = appDataFromRows(rows, { g1: 3 });
    expect(data.team).toEqual({ id: "t1", name: "Rattlers", ageGroup: "10U", coachPitch: true });
    expect(data.games[0]?.fieldPlayers).toBe(10);
    expect(data.season.fairPlayRules).toEqual({ maxInningsPitched: 3 });
    expect(data.lineups.g1).toEqual({
      innings: 4,
      battingOrder: ["p"],
      notBatting: ["x"],
      absent: ["y"],
      slots: [{ inning: 1, playerId: "p", position: "P" }],
      autoFillSeed: 3,
    });
    expect(data.lineups.g2).toBeUndefined();
    expect(data.me).toEqual({ userId: "me", role: "coach" });
    expect(data.members.map((m) => m.displayName)).toEqual(["Sam's mom", null, "Leo's dad"]);
  });

  it("keeps only invites that can still be used", () => {
    const base: InviteRow = {
      id: "i",
      team_id: "t1",
      role: "parent",
      token: "x".repeat(40),
      created_at: "2026-10-01T00:00:00Z",
      expires_at: "2026-11-01T00:00:00Z",
      max_uses: null,
      uses: 3,
      revoked_at: null,
    };
    const now = new Date("2026-10-20T00:00:00Z");
    const rows = [
      base,
      { ...base, id: "revoked", revoked_at: "2026-10-02T00:00:00Z" },
      { ...base, id: "expired", expires_at: "2026-10-10T00:00:00Z" },
      { ...base, id: "used", max_uses: 1, uses: 1 },
    ];
    expect(activeInvites(rows, now).map((r) => r.id)).toEqual(["i"]);
  });

  it("lists only teams I'm a member of, with my strongest role on each", () => {
    const team = (id: string, name: string) => ({ id, name, age_group: "10U", coach_pitch: false });
    const teams = [team("t1", "Storm"), team("t2", "Rattlers"), team("t3", "Created then left")];
    const mine = [
      { team_id: "t1", role: "parent" as const },
      { team_id: "t2", role: "parent" as const },
      { team_id: "t2", role: "coach" as const },
    ];
    expect(summarizeMyTeams(teams, mine)).toEqual([
      { id: "t2", name: "Rattlers", ageGroup: "10U", role: "coach" },
      { id: "t1", name: "Storm", ageGroup: "10U", role: "parent" },
    ]);
  });
});
