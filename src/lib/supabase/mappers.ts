import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";
import { bestRole } from "@/lib/data/permissions";
import type { AppData, Game, GameLineup, Invite, Member, TeamSummary } from "@/lib/data/types";
import type {
  GameRow,
  InviteRow,
  LineupRow,
  LineupSlotRow,
  MemberRow,
  PlayerRow,
  SeasonRow,
  TeamRow,
} from "./rows";

export interface TeamRows {
  team: TeamRow;
  season: SeasonRow;
  players: PlayerRow[];
  games: GameRow[];
  lineups: LineupRow[];
  slots: LineupSlotRow[];
  members: MemberRow[];
  invites: InviteRow[];
  /** The signed-in user. */
  userId: string;
  myTeams: TeamSummary[];
}

/**
 * Teams the user is a member of (sorted by name), with their strongest role on each.
 * Teams they can see only as creator, without a membership, are left out.
 */
export function summarizeMyTeams(
  teams: TeamRow[],
  myMemberships: { team_id: string; role: MemberRow["role"] }[],
): TeamSummary[] {
  return teams
    .filter((t) => myMemberships.some((m) => m.team_id === t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      ageGroup: t.age_group,
      role: bestRole(myMemberships.filter((m) => m.team_id === t.id).map((m) => m.role)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function memberFromRow(r: MemberRow): Member {
  return { id: r.id, userId: r.user_id, role: r.role, displayName: r.display_name };
}

export function inviteFromRow(r: InviteRow): Invite {
  return {
    id: r.id,
    role: r.role,
    token: r.token,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    maxUses: r.max_uses,
    uses: r.uses,
  };
}

/** Invites that can still be used (not revoked, not expired, not used up). */
export function activeInvites(rows: InviteRow[], now: Date): InviteRow[] {
  return rows.filter(
    (r) =>
      r.revoked_at === null &&
      new Date(r.expires_at) > now &&
      (r.max_uses === null || r.uses < r.max_uses),
  );
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
    fieldPlayers: r.field_players,
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
    field_players: g.fieldPlayers,
    status: g.status,
  };
}

/** Arguments for the save_lineup database function. */
export function lineupToRpcArgs(gameId: string, lineup: Lineup) {
  return {
    p_game_id: gameId,
    p_batting_order: lineup.battingOrder,
    p_not_batting: lineup.notBatting ?? [],
    p_absent: lineup.absent ?? [],
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
      notBatting: l.not_batting,
      absent: l.absent,
      slots: rows.slots
        .filter((s) => s.lineup_id === l.id)
        .map((s) => ({ inning: s.inning, playerId: s.player_id, position: s.position })),
      autoFillSeed: autoFillSeeds[game.id] ?? 0,
    };
  }
  const members = rows.members.map(memberFromRow);
  return {
    me: {
      userId: rows.userId,
      role: bestRole(members.filter((m) => m.userId === rows.userId).map((m) => m.role)),
    },
    members,
    invites: activeInvites(rows.invites, new Date()).map(inviteFromRow),
    myTeams: rows.myTeams,
    team: {
      id: rows.team.id,
      name: rows.team.name,
      ageGroup: rows.team.age_group,
      coachPitch: rows.team.coach_pitch,
    },
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
