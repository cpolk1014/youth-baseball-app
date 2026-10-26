"use client";

import type { Lineup, Player } from "@/lib/rules/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  appDataFromRows,
  gameToRow,
  lineupToRpcArgs,
  playerToRow,
  summarizeMyTeams,
} from "@/lib/supabase/mappers";
import type { MemberRole } from "./permissions";
import type {
  GameRow,
  InviteRow,
  LineupRow,
  LineupSlotRow,
  MemberRow,
  PlayerRow,
  SeasonRow,
  TeamRow,
} from "@/lib/supabase/rows";
import type { AppData, Game, GameStatus } from "./types";

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
      .select("id,name,age_group,coach_pitch")
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
  const team = teams.find((t) => t.id === preferredTeamId) ?? teams[0];
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
      .select("id,season_id,game_date,start_time,opponent,location,innings,field_players,status")
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
