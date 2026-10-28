import type { RuleConfigInput } from "@/lib/rules/config";
import type { Lineup, Player } from "@/lib/rules/types";
import { bestRole } from "@/lib/data/permissions";
import type { MoneySummary } from "@/lib/finance/ledger";
import type { FinanceEntry } from "@/lib/finance/types";
import type {
  AppData,
  Game,
  GameLineup,
  Invite,
  Member,
  PlayAssignment,
  Practice,
  QuizResult,
  TeamSummary,
} from "@/lib/data/types";
import type {
  GameRow,
  InviteRow,
  LineupRow,
  LineupSlotRow,
  MemberRow,
  FinanceEntryRow,
  FinanceShareRow,
  PlayAssignmentRow,
  PlayerGuardianRow,
  PlayerRow,
  PracticeRow,
  QuizResultRow,
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
  practices: PracticeRow[];
  assignments: PlayAssignmentRow[];
  quizResults: QuizResultRow[];
  guardians: PlayerGuardianRow[];
  financeEntries: FinanceEntryRow[];
  financeShares: FinanceShareRow[];
  financeSummary: MoneySummary | null;
  groupme: { bot_id: string; group_name: string | null } | null;
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
      optioned: t.optioned_at !== null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function practiceFromRow(r: PracticeRow): Practice {
  return {
    id: r.id,
    seasonId: r.season_id,
    date: r.practice_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    location: r.location,
    focus: r.focus,
    notes: r.notes,
    plan: r.plan,
    canceled: r.canceled,
    plays: r.plays ?? [],
  };
}

export function practiceToRow(p: Practice): PracticeRow {
  return {
    id: p.id,
    season_id: p.seasonId,
    practice_date: p.date,
    start_time: p.startTime,
    end_time: p.endTime,
    location: p.location,
    focus: p.focus,
    notes: p.notes,
    plan: p.plan,
    canceled: p.canceled,
    plays: p.plays,
  };
}

export function assignmentFromRow(r: PlayAssignmentRow): PlayAssignment {
  return {
    id: r.id,
    title: r.title,
    playIds: r.play_ids,
    dueDate: r.due_date,
    createdAt: r.created_at,
  };
}

export function assignmentToRow(a: PlayAssignment, teamId: string): PlayAssignmentRow {
  return {
    id: a.id,
    team_id: teamId,
    title: a.title,
    play_ids: a.playIds,
    due_date: a.dueDate,
    created_at: a.createdAt,
  };
}

export function quizResultFromRow(r: QuizResultRow): QuizResult {
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    userId: r.user_id,
    playerId: r.player_id,
    correct: r.correct,
    total: r.total,
    completedAt: r.completed_at,
  };
}

export function quizResultToRow(q: QuizResult): QuizResultRow {
  return {
    id: q.id,
    assignment_id: q.assignmentId,
    user_id: q.userId,
    player_id: q.playerId,
    correct: q.correct,
    total: q.total,
    completed_at: q.completedAt,
  };
}

export function financeEntryFromRow(r: FinanceEntryRow): FinanceEntry {
  return {
    id: r.id,
    seasonId: r.season_id,
    type: r.type,
    title: r.title,
    amountCents: r.amount_cents,
    date: r.entry_date,
    category: r.category,
    payee: r.payee,
    method: r.method,
    refund: r.refund,
    estimate: r.estimate,
    dueDates: r.due_dates,
    note: r.note,
    receiptPath: r.receipt_path ?? null,
  };
}

export function financeEntryToRow(e: FinanceEntry): FinanceEntryRow {
  return {
    id: e.id,
    season_id: e.seasonId,
    type: e.type,
    title: e.title,
    amount_cents: e.amountCents,
    entry_date: e.date,
    category: e.category,
    payee: e.payee,
    method: e.method,
    refund: e.refund,
    estimate: e.estimate,
    due_dates: e.dueDates,
    note: e.note,
    receipt_path: e.receiptPath,
  };
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
    practices: rows.practices.map(practiceFromRow),
    assignments: rows.assignments.map(assignmentFromRow),
    quizResults: rows.quizResults.map(quizResultFromRow),
    guardians: rows.guardians.map((g) => ({ id: g.id, playerId: g.player_id, userId: g.user_id })),
    financeEntries: rows.financeEntries.map(financeEntryFromRow),
    financeShares: rows.financeShares.map((s) => ({
      id: s.id,
      entryId: s.entry_id,
      playerId: s.player_id,
      amountCents: s.amount_cents,
    })),
    financeSummary: rows.financeSummary,
    groupme: rows.groupme
      ? { botId: rows.groupme.bot_id, groupName: rows.groupme.group_name }
      : null,
    team: {
      id: rows.team.id,
      name: rows.team.name,
      ageGroup: rows.team.age_group,
      coachPitch: rows.team.coach_pitch,
      optionedAt: rows.team.optioned_at,
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
