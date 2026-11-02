import { appDataFromRows } from "@/lib/supabase/mappers";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type {
  GameRow,
  LineupRow,
  LineupSlotRow,
  MemberRow,
  PlayerRow,
  SeasonRow,
  TeamRow,
} from "@/lib/supabase/rows";
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
        "id,season_id,game_date,start_time,opponent,location,innings,field_players,status,score_us,score_them,lineup_style",
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
