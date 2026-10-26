"use client";

import type { Lineup, Player } from "@/lib/rules/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { appDataFromRows, gameToRow, lineupToRpcArgs, playerToRow } from "@/lib/supabase/mappers";
import type {
  GameRow,
  LineupRow,
  LineupSlotRow,
  PlayerRow,
  SeasonRow,
  TeamRow,
} from "@/lib/supabase/rows";
import type { AppData, Game, GameStatus } from "./types";

export type LoadResult =
  | { kind: "ready"; data: AppData; email: string | null }
  | { kind: "setup"; team: TeamRow | null; email: string | null };

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Load the signed-in user's team (first one, for now) and its latest season. */
export async function loadFromSupabase(autoFillSeeds: Record<string, number>): Promise<LoadResult> {
  const sb = getBrowserSupabase();
  const email = (await sb.auth.getUser()).data.user?.email ?? null;

  const teams = check<TeamRow[]>(
    await sb.from("team").select("id,name,age_group,coach_pitch").order("created_at").limit(1),
  );
  const team = teams[0];
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
          .select("id,game_id,batting_order,not_batting,version")
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

  return {
    kind: "ready",
    email,
    data: appDataFromRows({ team, season, players, games, lineups, slots }, autoFillSeeds),
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
}): Promise<void> {
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
}

export async function signOut(): Promise<void> {
  await getBrowserSupabase().auth.signOut();
}
