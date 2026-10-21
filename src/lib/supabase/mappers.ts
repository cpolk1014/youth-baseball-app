import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";
import type { AppData, Game, GameLineup } from "@/lib/data/types";
import type { GameRow, LineupRow, LineupSlotRow, PlayerRow, SeasonRow, TeamRow } from "./rows";

export interface TeamRows {
  team: TeamRow;
  season: SeasonRow;
  players: PlayerRow[];
  games: GameRow[];
  lineups: LineupRow[];
  slots: LineupSlotRow[];
}

export function playerFromRow(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    jerseyNumber: r.jersey_number,
    preferredPositions: r.preferred_positions,
    canPitch: r.can_pitch,
    canCatch: r.can_catch,
    active: r.active,
  };
}

export function playerToRow(p: Player, teamId: string): PlayerRow {
  return {
    id: p.id,
    team_id: teamId,
    name: p.name,
    jersey_number: p.jerseyNumber ?? null,
    preferred_positions: p.preferredPositions,
    can_pitch: p.canPitch,
    can_catch: p.canCatch,
    active: p.active !== false,
  };
}

export function gameFromRow(r: GameRow): Game {
  return {
    id: r.id,
    seasonId: r.season_id,
    date: r.game_date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    opponent: r.opponent,
    location: r.location,
    innings: r.innings,
    status: r.status,
  };
}

export function gameToRow(g: Game): GameRow {
  return {
    id: g.id,
    season_id: g.seasonId,
    game_date: g.date,
    start_time: g.startTime,
    opponent: g.opponent,
    location: g.location,
    innings: g.innings,
    status: g.status,
  };
}

/** Arguments for the save_lineup database function. */
export function lineupToRpcArgs(gameId: string, lineup: Lineup) {
  return {
    p_game_id: gameId,
    p_batting_order: lineup.battingOrder,
    p_slots: lineup.slots.map((s) => ({
      inning: s.inning,
      player_id: s.playerId,
      position: s.position,
    })),
  };
}

/** Build the app's data from one team's rows, using each game's highest lineup version. */
export function appDataFromRows(
  rows: TeamRows,
  autoFillSeeds: Record<string, number> = {},
): AppData {
  const games = rows.games.map(gameFromRow);
  const current = new Map<string, LineupRow>();
  for (const l of rows.lineups) {
    const prev = current.get(l.game_id);
    if (!prev || l.version > prev.version) current.set(l.game_id, l);
  }
  const lineups: Record<string, GameLineup> = {};
  for (const game of games) {
    const l = current.get(game.id);
    if (!l) continue;
    lineups[game.id] = {
      innings: game.innings,
      battingOrder: l.batting_order,
      slots: rows.slots
        .filter((s) => s.lineup_id === l.id)
        .map((s) => ({ inning: s.inning, playerId: s.player_id, position: s.position })),
      autoFillSeed: autoFillSeeds[game.id] ?? 0,
    };
  }
  return {
    team: { id: rows.team.id, name: rows.team.name, ageGroup: rows.team.age_group },
    season: {
      id: rows.season.id,
      teamId: rows.season.team_id,
      name: rows.season.name,
      fairPlayRules: rows.season.fair_play_rules as RuleConfigInput,
    },
    players: rows.players.map(playerFromRow),
    games,
    lineups,
  };
}
