import { appDataFromRows, uniformFromRow } from "@/lib/supabase/mappers";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type {
  GameRow,
  LineupRow,
  LineupSlotRow,
  MemberRow,
  PlayerRow,
  SeasonRow,
  TeamRow,
  UniformComboRow,
} from "@/lib/supabase/rows";
import type { UniformCombo } from "@/lib/uniforms";
import type { AppData } from "./types";

// Clubs: a club's admins see the teams that joined with a club code (view only; the
// database decides what they can read). Coaches enter the code for their team.

// Untyped client: joined rows (organization:organization_id(name)) come back as one object.
function check<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export interface MyClub {
  id: string;
  name: string;
  role: "director" | "admin";
}

/** Clubs the signed-in user runs. */
/** Start a club (free); you become its director. Returns the club's id. */
export async function startMyClub(name: string): Promise<string> {
  const { data, error } = await getBrowserSupabase().rpc("start_my_club", { p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function myClubs(): Promise<MyClub[]> {
  const sb = getBrowserSupabase();
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return [];
  const rows = check<
    { organization_id: string; role: MyClub["role"]; organization: { name: string } | null }[]
  >(
    await sb
      .from("club_admin")
      .select("organization_id, role, organization:organization_id(name)")
      .eq("user_id", user.id),
  );
  return rows
    .map((r) => ({ id: r.organization_id, name: r.organization?.name ?? "Club", role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TeamClub {
  club: string;
  season: string;
  expiresOn: string;
}

/** The club a team belongs to this season (coaches and managers can see it). */
export async function teamClub(teamId: string): Promise<TeamClub | null> {
  const rows = check<
    { season_label: string; expires_on: string; organization: { name: string } | null }[]
  >(
    await getBrowserSupabase()
      .from("club_code")
      .select("season_label, expires_on, organization:organization_id(name)")
      .eq("team_id", teamId)
      .order("season_label", { ascending: false })
      .limit(1),
  );
  const r = rows[0];
  return r
    ? { club: r.organization?.name ?? "Club", season: r.season_label, expiresOn: r.expires_on }
    : null;
}

/** A coach enters a club code for their team. */
export async function redeemClubCode(teamId: string, code: string): Promise<TeamClub> {
  const r = check<{ club: string; season: string }>(
    await getBrowserSupabase().rpc("redeem_club_code", { p_team_id: teamId, p_code: code }),
  );
  return { club: r.club, season: r.season, expiresOn: "" };
}

export interface ClubTeam {
  teamId: string;
  name: string;
  ageGroup: string;
  colors: string[];
  logoPath: string | null;
  season: string;
  headCoach: string | null;
  players: number;
  wins: number;
  losses: number;
  ties: number;
  nextGame: { date: string; time: string | null; opponent: string } | null;
  lastLineupAt: string | null;
}

/** Every team in the club this season, for the dashboard. */
export async function clubOverview(clubId: string): Promise<ClubTeam[]> {
  const rows = check<
    {
      team_id: string;
      team_name: string;
      age_group: string;
      colors: string[] | null;
      logo_path: string | null;
      season_label: string;
      head_coach: string | null;
      players: number;
      wins: number;
      losses: number;
      ties: number;
      next_game_date: string | null;
      next_game_time: string | null;
      next_opponent: string | null;
      last_lineup_at: string | null;
    }[]
  >(await getBrowserSupabase().rpc("club_overview", { p_org: clubId }));
  return rows.map((r) => ({
    teamId: r.team_id,
    name: r.team_name,
    ageGroup: r.age_group,
    colors: r.colors ?? [],
    logoPath: r.logo_path,
    season: r.season_label,
    headCoach: r.head_coach,
    players: r.players,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    nextGame: r.next_game_date
      ? {
          date: r.next_game_date,
          time: r.next_game_time ? r.next_game_time.slice(0, 5) : null,
          opponent: r.next_opponent ?? "",
        }
      : null,
    lastLineupAt: r.last_lineup_at,
  }));
}

export interface ClubCode {
  code: string;
  season: string;
  expiresOn: string;
  teamName: string | null;
  redeemedAt: string | null;
}

/** The club's codes and which team used each. */
export async function clubCodes(clubId: string): Promise<ClubCode[]> {
  const rows = check<
    {
      code: string;
      season_label: string;
      expires_on: string;
      redeemed_at: string | null;
      team: { name: string; age_group: string } | null;
    }[]
  >(
    await getBrowserSupabase()
      .from("club_code")
      .select("code, season_label, expires_on, redeemed_at, team:team_id(name, age_group)")
      .eq("organization_id", clubId)
      .order("season_label", { ascending: false })
      .order("redeemed_at", { ascending: true, nullsFirst: false }),
  );
  return rows.map((r) => ({
    code: r.code,
    season: r.season_label,
    expiresOn: r.expires_on,
    teamName: r.team ? `${r.team.name} (${r.team.age_group})` : null,
    redeemedAt: r.redeemed_at,
  }));
}

/**
 * One club team's season, read-only: players, games, lineups and rules (what the club may
 * see). Shaped like the app's team data so the same views can show it.
 */
export async function loadClubTeam(teamId: string): Promise<AppData> {
  const sb = getBrowserSupabase();
  const team = check<TeamRow | null>(
    await sb
      .from("team")
      .select("id,name,age_group,coach_pitch,optioned_at,colors,logo_path")
      .eq("id", teamId)
      .maybeSingle(),
  );
  if (!team) throw new Error("This team isn't in your club this season.");
  const season = check<SeasonRow[]>(
    await sb
      .from("season")
      .select("id,team_id,name,fair_play_rules")
      .eq("team_id", teamId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1),
  )[0];
  if (!season) throw new Error("This team hasn't started a season yet.");
  const [players, games, members] = await Promise.all([
    sb
      .from("player")
      .select("id,team_id,name,jersey_number,preferred_positions,can_pitch,can_catch,active")
      .eq("team_id", teamId)
      .then((r) => check<PlayerRow[]>(r)),
    sb
      .from("game")
      .select(
        "id,season_id,game_date,start_time,opponent,location,innings,field_players,status,score_us,score_them,lineup_style,field",
      )
      .eq("season_id", season.id)
      .then((r) => check<GameRow[]>(r)),
    sb
      .from("member")
      .select("id,team_id,user_id,role,display_name")
      .eq("team_id", teamId)
      .then((r) => check<MemberRow[]>(r)),
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
  const user = (await sb.auth.getUser()).data.user;
  const data = appDataFromRows({
    team,
    season,
    players,
    games,
    lineups,
    slots,
    members,
    invites: [],
    practices: [],
    assignments: [],
    quizResults: [],
    guardians: [],
    financeEntries: [],
    financeShares: [],
    financeSummary: null,
    groupme: null,
    userId: user?.id ?? "",
    myTeams: [],
  });
  // Not a member: view only.
  return { ...data, me: { userId: user?.id ?? null, role: "parent" } };
}

// ── Phase 2: the club's look, uniforms, library and GroupMe ──

export interface ClubLook {
  name: string;
  /** The club's main and accent colors, picked from the palette. */
  colors: string[];
  logoPath: string | null;
  /** Colors found in what the director uploaded; the only ones the club can pick from. */
  palette: string[];
}

export async function clubLook(clubId: string): Promise<ClubLook> {
  const r = check<{
    name: string;
    colors: string[] | null;
    logo_path: string | null;
    palette: string[] | null;
  }>(
    await getBrowserSupabase()
      .from("organization")
      .select("name, colors, logo_path, palette")
      .eq("id", clubId)
      .single(),
  );
  return {
    name: r.name,
    colors: r.colors ?? [],
    logoPath: r.logo_path,
    palette: r.palette ?? [],
  };
}

export async function saveClubLook(
  clubId: string,
  colors: string[],
  logoPath: string | null,
  palette: string[],
): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("organization")
      .update({ colors, logo_path: logoPath, palette })
      .eq("id", clubId),
  );
}

/** Upload the club's logo (already squared); returns where it's stored. */
export async function uploadClubLogo(clubId: string, file: Blob): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `club/${clubId}/logo-${crypto.randomUUID()}.${ext}`;
  check(
    await getBrowserSupabase()
      .storage.from("team-logos")
      .upload(path, file, { contentType: file.type, upsert: false }),
  );
  return path;
}

export async function removeClubLogo(path: string): Promise<void> {
  if (!path.startsWith("club/")) return;
  await getBrowserSupabase().storage.from("team-logos").remove([path]);
}

const UNIFORM_COLS = "id,team_id,organization_id,name,shirt,pants,hat,belt,socks";

export async function clubUniforms(clubId: string): Promise<UniformCombo[]> {
  const rows = check<UniformComboRow[]>(
    await getBrowserSupabase()
      .from("uniform_combo")
      .select(UNIFORM_COLS)
      .eq("organization_id", clubId)
      .order("created_at"),
  );
  return rows.map(uniformFromRow);
}

export async function saveClubUniforms(clubId: string, combos: UniformCombo[]): Promise<void> {
  check(
    await getBrowserSupabase()
      .from("uniform_combo")
      .upsert(
        combos.map(({ id, name, shirt, pants, hat, belt, socks }) => ({
          id,
          organization_id: clubId,
          team_id: null,
          name,
          shirt,
          pants,
          hat,
          belt,
          socks,
        })),
      ),
  );
}

export async function deleteClubUniform(id: string): Promise<void> {
  check(await getBrowserSupabase().from("uniform_combo").delete().eq("id", id));
}

export interface ClubPlan {
  id: string;
  title: string;
  focus: string | null;
  items: { title: string; minutes: number; notes?: string }[];
}

export interface ClubPlaySet {
  id: string;
  title: string;
  playIds: string[];
}

export async function clubPlans(clubId: string): Promise<ClubPlan[]> {
  const rows = check<
    { id: string; title: string; focus: string | null; items: ClubPlan["items"] }[]
  >(
    await getBrowserSupabase()
      .from("club_practice_plan")
      .select("id, title, focus, items")
      .eq("organization_id", clubId)
      .order("title"),
  );
  return rows.map((r) => ({ ...r, items: Array.isArray(r.items) ? r.items : [] }));
}

export async function saveClubPlan(clubId: string, plan: ClubPlan): Promise<void> {
  check(
    await getBrowserSupabase().from("club_practice_plan").upsert({
      id: plan.id,
      organization_id: clubId,
      title: plan.title,
      focus: plan.focus,
      items: plan.items,
    }),
  );
}

export async function deleteClubPlan(id: string): Promise<void> {
  check(await getBrowserSupabase().from("club_practice_plan").delete().eq("id", id));
}

export async function clubPlaySets(clubId: string): Promise<ClubPlaySet[]> {
  const rows = check<{ id: string; title: string; play_ids: string[] }[]>(
    await getBrowserSupabase()
      .from("club_play_set")
      .select("id, title, play_ids")
      .eq("organization_id", clubId)
      .order("title"),
  );
  return rows.map((r) => ({ id: r.id, title: r.title, playIds: r.play_ids }));
}

export async function saveClubPlaySet(clubId: string, set: ClubPlaySet): Promise<void> {
  check(
    await getBrowserSupabase().from("club_play_set").upsert({
      id: set.id,
      organization_id: clubId,
      title: set.title,
      play_ids: set.playIds,
    }),
  );
}

export async function deleteClubPlaySet(id: string): Promise<void> {
  check(await getBrowserSupabase().from("club_play_set").delete().eq("id", id));
}

export interface ClubGroupMe {
  botId: string;
  groupName: string | null;
}

export async function clubGroupMe(clubId: string): Promise<ClubGroupMe | null> {
  const r = check<{ bot_id: string; group_name: string | null } | null>(
    await getBrowserSupabase()
      .from("club_groupme")
      .select("bot_id, group_name")
      .eq("organization_id", clubId)
      .maybeSingle(),
  );
  return r ? { botId: r.bot_id, groupName: r.group_name } : null;
}

export async function saveClubGroupMe(
  clubId: string,
  botId: string,
  groupName: string | null,
): Promise<void> {
  check(
    await getBrowserSupabase().from("club_groupme").upsert({
      organization_id: clubId,
      bot_id: botId,
      group_name: groupName,
      connected_at: new Date().toISOString(),
    }),
  );
}

export async function disconnectClubGroupMe(clubId: string): Promise<void> {
  check(await getBrowserSupabase().from("club_groupme").delete().eq("organization_id", clubId));
}

export interface ClubTarget {
  teamId: string;
  name: string;
  ageGroup: string;
  connected: boolean;
}

/** Club teams this season and whether each has GroupMe connected. */
export async function clubTargets(clubId: string): Promise<ClubTarget[]> {
  const rows = check<
    { team_id: string; team_name: string; age_group: string; connected: boolean }[]
  >(await getBrowserSupabase().rpc("club_groupme_targets", { p_org: clubId }));
  return rows
    .map((r) => ({
      teamId: r.team_id,
      name: r.team_name,
      ageGroup: r.age_group,
      connected: r.connected,
    }))
    .sort((a, b) => a.ageGroup.localeCompare(b.ageGroup) || a.name.localeCompare(b.name));
}

/** Post to the coaches group and/or team groups; returns how many groups it went to. */
export async function clubPost(
  clubId: string,
  coaches: boolean,
  teamIds: string[],
  text: string,
): Promise<number> {
  return check<number>(
    await getBrowserSupabase().rpc("club_groupme_post", {
      p_org: clubId,
      p_coaches: coaches,
      p_team_ids: teamIds,
      p_text: text,
    }),
  );
}

/** The team's own season passes (team members can see them). */
export async function teamPasses(teamId: string): Promise<{ season: string; expiresOn: string }[]> {
  const rows = check<{ season_label: string; expires_on: string }[]>(
    await getBrowserSupabase()
      .from("team_pass")
      .select("season_label, expires_on")
      .eq("team_id", teamId)
      .order("season_label", { ascending: false }),
  );
  return rows.map((r) => ({ season: r.season_label, expiresOn: r.expires_on }));
}
