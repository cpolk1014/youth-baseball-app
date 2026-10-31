"use client";

import type { Lineup, Player } from "@/lib/rules/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  appDataFromRows,
  assignmentToRow,
  financeEntryToRow,
  gameToRow,
  lineupToRpcArgs,
  playerToRow,
  practiceToRow,
  quizResultToRow,
  summarizeMyTeams,
} from "@/lib/supabase/mappers";
import type { MemberRole } from "./permissions";
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
} from "@/lib/supabase/rows";
import type { MoneySummary } from "@/lib/finance/ledger";
import type { RuleConfigInput } from "@/lib/rules/config";
import type { FinanceEntry, FinanceShare } from "@/lib/finance/types";
import type {
  AppData,
  Game,
  GameStatus,
  LineupStyle,
  Guardian,
  PlayAssignment,
  Practice,
  QuizResult,
} from "./types";

export type LoadResult =
  | { kind: "ready"; data: AppData; email: string | null; teamId: string }
  | { kind: "setup"; team: TeamRow | null; email: string | null };

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Load the signed-in user's team (the preferred one, else their first) and latest season. */
export async function loadFromSupabase(
  autoFillSeeds: Record<string, number>,
  preferredTeamId: string | null,
): Promise<LoadResult> {
  const sb = getBrowserSupabase();
  const user = (await sb.auth.getUser()).data.user;
  const email = user?.email ?? null;

  const [allTeams, myMemberships] = await Promise.all([
    sb
      .from("team")
      .select("id,name,age_group,coach_pitch,optioned_at,colors,logo_path")
      .order("created_at")
      .then((r) => check<TeamRow[]>(r)),
    sb
      .from("member")
      .select("team_id,role")
      .eq("user_id", user?.id ?? "")
      .then((r) => check<Pick<MemberRow, "team_id" | "role">[]>(r)),
  ]);
  const myTeams = summarizeMyTeams(allTeams, myMemberships);
  // Only teams the user is a member of (not ones they merely created and then left).
  const teams = allTeams.filter((t) => myTeams.some((m) => m.id === t.id));
  // The team the user last opened; otherwise their first active (not optioned) team.
  const team =
    teams.find((t) => t.id === preferredTeamId) ??
    teams.find((t) => t.optioned_at === null) ??
    teams[0];
  if (!team) return { kind: "setup", team: null, email };

  const seasons = check<SeasonRow[]>(
    await sb
      .from("season")
      .select("id,team_id,name,fair_play_rules")
      .eq("team_id", team.id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1),
  );
  const season = seasons[0];
  if (!season) return { kind: "setup", team, email };

  const [players, games] = await Promise.all([
    sb
      .from("player")
      .select("id,team_id,name,jersey_number,preferred_positions,can_pitch,can_catch,active")
      .eq("team_id", team.id)
      .then((r) => check<PlayerRow[]>(r)),
    sb
      .from("game")
      .select(
        "id,season_id,game_date,start_time,opponent,location,innings,field_players,status,score_us,score_them,lineup_style",
      )
      .eq("season_id", season.id)
      .then((r) => check<GameRow[]>(r)),
  ]);

  const lineups = games.length
    ? check<LineupRow[]>(
        await sb
          .from("lineup")
          .select("id,game_id,batting_order,not_batting,absent,version")
          .in(
            "game_id",
            games.map((g) => g.id),
          ),
      )
    : [];
  const slots = lineups.length
    ? check<LineupSlotRow[]>(
        await sb
          .from("lineup_slot")
          .select("lineup_id,inning,player_id,position")
          .in(
            "lineup_id",
            lineups.map((l) => l.id),
          ),
      )
    : [];

  const practices = check<PracticeRow[]>(
    await sb
      .from("practice")
      .select(
        "id,season_id,practice_date,start_time,end_time,location,focus,notes,plan,canceled,plays",
      )
      .eq("season_id", season.id),
  );
  const assignments = check<PlayAssignmentRow[]>(
    await sb
      .from("play_assignment")
      .select("id,team_id,title,play_ids,due_date,created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
  );
  // RLS returns everyone's results to coaches and managers, only their own to families.
  const quizResults = assignments.length
    ? check<QuizResultRow[]>(
        await sb
          .from("quiz_result")
          .select("id,assignment_id,user_id,player_id,correct,total,completed_at")
          .in(
            "assignment_id",
            assignments.map((a) => a.id),
          ),
      )
    : [];
  // RLS returns every link to coaches and managers, only their own to families.
  const guardians = players.length
    ? check<PlayerGuardianRow[]>(
        await sb
          .from("player_guardian")
          .select("id,player_id,user_id")
          .in(
            "player_id",
            players.map((p) => p.id),
          ),
      )
    : [];
  // RLS trims what non-treasurers see; the summary gives everyone the team totals.
  const financeEntries = check<FinanceEntryRow[]>(
    await sb
      .from("finance_entry")
      .select(
        "id,season_id,type,title,amount_cents,entry_date,category,payee,method,refund,estimate,due_dates,note,receipt_path",
      )
      .eq("season_id", season.id)
      .order("entry_date", { ascending: false }),
  );
  const financeShares = financeEntries.length
    ? check<FinanceShareRow[]>(
        await sb
          .from("finance_share")
          .select("id,entry_id,player_id,amount_cents")
          .in(
            "entry_id",
            financeEntries.map((e) => e.id),
          ),
      )
    : [];
  const financeSummary = check<MoneySummary | null>(
    await sb.rpc("finance_summary", { p_season_id: season.id }),
  );
  // RLS shows the bot only to coaches and managers.
  const groupme = check<{ bot_id: string; group_name: string | null } | null>(
    await sb.from("team_groupme").select("bot_id,group_name").eq("team_id", team.id).maybeSingle(),
  );
  const members = check<MemberRow[]>(
    await sb.from("member").select("id,team_id,user_id,role,display_name").eq("team_id", team.id),
  );
  // Only coaches can read invites; for everyone else RLS returns none.
  const invites = check<InviteRow[]>(
    await sb
      .from("invite")
      .select("id,team_id,role,token,created_at,expires_at,max_uses,uses,revoked_at")
      .eq("team_id", team.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  );

  return {
    kind: "ready",
    email,
    teamId: team.id,
    data: appDataFromRows(
      {
        team,
        season,
        players,
        games,
        lineups,
        slots,
        members,
        invites,
        practices,
        assignments,
        quizResults,
        guardians,
        financeEntries,
        financeShares,
        financeSummary,
        groupme,
        userId: user?.id ?? "",
        myTeams,
      },
      autoFillSeeds,
    ),
  };
}

export async function savePlayerRow(player: Player, teamId: string): Promise<void> {
  check(await getBrowserSupabase().from("player").upsert(playerToRow(player, teamId)));
}

/** Save a game; if its lineup was trimmed to fit, save that too (after the game). */
export async function saveGameRow(game: Game, trimmedLineup: Lineup | null): Promise<void> {
  const sb = getBrowserSupabase();
  check(await sb.from("game").upsert(gameToRow(game)));
  if (trimmedLineup) check(await sb.rpc("save_lineup", lineupToRpcArgs(game.id, trimmedLineup)));
}

export async function saveTeamSettings(teamId: string, coachPitch: boolean): Promise<void> {
  check(
    await getBrowserSupabase().from("team").update({ coach_pitch: coachPitch }).eq("id", teamId),
  );
}

export async function saveTeamOptioned(teamId: string, optionedAt: string | null): Promise<void> {
  check(
    await getBrowserSupabase().from("team").update({ optioned_at: optionedAt }).eq("id", teamId),
  );
}

export async function saveGameStatus(gameId: string, status: GameStatus): Promise<void> {
  check(await getBrowserSupabase().from("game").update({ status }).eq("id", gameId));
}

export async function saveLineupRpc(gameId: string, lineup: Lineup): Promise<void> {
  check(await getBrowserSupabase().rpc("save_lineup", lineupToRpcArgs(gameId, lineup)));
}

/** Create a team (the creator becomes coach) and/or its first season with default rules. */
export async function createTeamAndSeason(input: {
  team: TeamRow | null;
  teamName: string;
  ageGroup: string;
  coachPitch: boolean;
  seasonName: string;
}): Promise<string> {
  const sb = getBrowserSupabase();
  let teamId = input.team?.id;
  if (!teamId) {
    const user = (await sb.auth.getUser()).data.user;
    const created = check<{ id: string }>(
      await sb
        .from("team")
        .insert({
          name: input.teamName,
          age_group: input.ageGroup,
          coach_pitch: input.coachPitch,
          created_by: user?.id,
        })
        .select("id")
        .single(),
    );
    teamId = created.id;
  }
  check(await sb.from("season").insert({ team_id: teamId, name: input.seasonName }));
  return teamId;
}

export async function signOut(): Promise<void> {
  await getBrowserSupabase().auth.signOut();
}

/** Random URL-safe token for an invite link (256 bits). */
function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create an invite link. Parent links work for anyone for 14 days; coach and manager links
 * work once, for 7 days.
 */
export async function createInviteRow(teamId: string, role: MemberRole): Promise<string> {
  const sb = getBrowserSupabase();
  const user = (await sb.auth.getUser()).data.user;
  const single = role !== "parent";
  const token = newInviteToken();
  check(
    await sb.from("invite").insert({
      team_id: teamId,
      role,
      token,
      created_by: user?.id,
      max_uses: single ? 1 : null,
      expires_at: new Date(Date.now() + (single ? 7 : 14) * 86_400_000).toISOString(),
    }),
  );
  return token;
}

export async function revokeInviteRow(inviteId: string): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("invite")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId),
  );
}

export async function setMemberRoleRow(memberId: string, role: MemberRole): Promise<void> {
  check(await getBrowserSupabase().from("member").update({ role }).eq("id", memberId));
}

export async function removeMemberRow(memberId: string): Promise<void> {
  check(await getBrowserSupabase().from("member").delete().eq("id", memberId));
}

export interface InvitePreview {
  teamId: string;
  teamName: string;
  role: MemberRole;
  valid: boolean;
  alreadyMember: boolean;
}

/** What an invite link is for; null if the token doesn't exist. */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const rows = check<
    {
      team_id: string;
      team_name: string;
      role: MemberRole;
      valid: boolean;
      already_member: boolean;
    }[]
  >(await getBrowserSupabase().rpc("invite_preview", { p_token: token }));
  const r = rows[0];
  return r
    ? {
        teamId: r.team_id,
        teamName: r.team_name,
        role: r.role,
        valid: r.valid,
        alreadyMember: r.already_member,
      }
    : null;
}

/** Join the invite's team. Returns the team id. */
export async function acceptInvite(token: string, displayName: string): Promise<string> {
  return check<string>(
    await getBrowserSupabase().rpc("accept_invite", {
      p_token: token,
      p_display_name: displayName,
    }),
  );
}

/** Coach: permanently delete a team and everything in it (seasons, games, lineups, roster). */
export async function deleteTeamRow(teamId: string): Promise<void> {
  const sb = getBrowserSupabase();
  const deleted = check<{ id: string }[]>(
    await sb.from("team").delete().eq("id", teamId).select("id"),
  );
  if (deleted.length === 0) throw new Error("Only a coach can delete this team.");
}

export async function savePracticeRows(practices: Practice[]): Promise<void> {
  if (practices.length === 0) return;
  check(await getBrowserSupabase().from("practice").upsert(practices.map(practiceToRow)));
}

export async function saveGameRows(games: Game[]): Promise<void> {
  if (games.length === 0) return;
  check(await getBrowserSupabase().from("game").upsert(games.map(gameToRow)));
}

export async function deletePracticeRow(practiceId: string): Promise<void> {
  check(await getBrowserSupabase().from("practice").delete().eq("id", practiceId));
}

export async function saveAssignmentRow(a: PlayAssignment, teamId: string): Promise<void> {
  check(await getBrowserSupabase().from("play_assignment").upsert(assignmentToRow(a, teamId)));
}

export async function deleteAssignmentRow(assignmentId: string): Promise<void> {
  check(await getBrowserSupabase().from("play_assignment").delete().eq("id", assignmentId));
}

export async function saveQuizResultRow(q: QuizResult): Promise<void> {
  check(await getBrowserSupabase().from("quiz_result").insert(quizResultToRow(q)));
}

/** Remove and add parent ↔ kid links in one go. */
export async function saveGuardianChanges(remove: string[], add: Guardian[]): Promise<void> {
  const sb = getBrowserSupabase();
  if (remove.length) check(await sb.from("player_guardian").delete().in("id", remove));
  if (add.length) {
    check(
      await sb
        .from("player_guardian")
        .insert(add.map((g) => ({ id: g.id, player_id: g.playerId, user_id: g.userId }))),
    );
  }
}

/** Save an entry and its shares in one database call (all or nothing). */
export async function saveFinanceEntryRow(
  entry: FinanceEntry,
  shares: FinanceShare[],
): Promise<void> {
  check(
    await getBrowserSupabase().rpc("save_finance_entry", {
      p_entry: financeEntryToRow(entry),
      p_shares: shares.map((s) => ({ player_id: s.playerId, amount_cents: s.amountCents })),
    }),
  );
}

export async function deleteFinanceEntryRow(entryId: string): Promise<void> {
  check(await getBrowserSupabase().from("finance_entry").delete().eq("id", entryId));
}

/** Upload a receipt file to the private receipts bucket. */
export async function uploadReceiptFile(path: string, file: Blob): Promise<void> {
  check(
    await getBrowserSupabase()
      .storage.from("receipts")
      .upload(path, file, { contentType: file.type, upsert: false }),
  );
}

/** A link to view a receipt, good for an hour. */
export async function receiptSignedUrl(path: string): Promise<string> {
  const data = check(
    await getBrowserSupabase().storage.from("receipts").createSignedUrl(path, 3600),
  );
  return data.signedUrl;
}

export async function deleteReceiptFile(path: string): Promise<void> {
  check(await getBrowserSupabase().storage.from("receipts").remove([path]));
}

export async function saveGroupMeRow(
  teamId: string,
  botId: string,
  groupName: string | null,
): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("team_groupme")
      .upsert({ team_id: teamId, bot_id: botId, group_name: groupName }),
  );
}

export async function deleteGroupMeRow(teamId: string): Promise<void> {
  check(await getBrowserSupabase().from("team_groupme").delete().eq("team_id", teamId));
}

export async function saveSeasonRulesRow(seasonId: string, rules: RuleConfigInput): Promise<void> {
  check(
    await getBrowserSupabase().from("season").update({ fair_play_rules: rules }).eq("id", seasonId),
  );
}

export async function saveTeamLookRow(
  teamId: string,
  colors: string[],
  logoPath: string | null,
): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("team")
      .update({ colors, logo_path: logoPath })
      .eq("id", teamId),
  );
}

export async function uploadLogoFile(path: string, file: Blob): Promise<void> {
  check(
    await getBrowserSupabase()
      .storage.from("team-logos")
      .upload(path, file, { contentType: file.type, upsert: false }),
  );
}

export async function deleteLogoFile(path: string): Promise<void> {
  check(await getBrowserSupabase().storage.from("team-logos").remove([path]));
}

export async function saveGameResult(
  gameId: string,
  status: GameStatus,
  scoreUs: number | null,
  scoreThem: number | null,
): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("game")
      .update({ status, score_us: scoreUs, score_them: scoreThem })
      .eq("id", gameId),
  );
}

/** What a player is part of (any season), which deleting them would erase; null if nothing. */
export async function playerDataProblem(playerId: string): Promise<string | null> {
  const sb = getBrowserSupabase();
  const count = async (
    q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const [slots, orders, shares, walkups] = await Promise.all([
    count(sb.from("lineup_slot").select("lineup_id", head).eq("player_id", playerId)),
    count(
      sb
        .from("lineup")
        .select("game_id", head)
        .or(`batting_order.cs.{${playerId}},not_batting.cs.{${playerId}},absent.cs.{${playerId}}`),
    ),
    count(sb.from("finance_share").select("entry_id", head).eq("player_id", playerId)),
    count(sb.from("walkup").select("player_id", head).eq("player_id", playerId)),
  ]);
  if (slots + orders > 0) return "is in a game's lineup";
  if (shares > 0) return "has team money tagged to them";
  if (walkups > 0) return "has a walk-up song";
  return null;
}

export async function deletePlayerRow(playerId: string): Promise<void> {
  check(await getBrowserSupabase().from("player").delete().eq("id", playerId));
}

export async function saveLineupStyleRow(gameId: string, style: LineupStyle): Promise<void> {
  check(await getBrowserSupabase().from("game").update({ lineup_style: style }).eq("id", gameId));
}
