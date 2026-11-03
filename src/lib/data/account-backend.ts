import { getBrowserSupabase } from "@/lib/supabase/client";

// My RallyCap: the signed-in person across all their teams and clubs.

// Untyped client: joined rows (player:player_id(...)) come back as one object.
function check<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
}

export async function getMe(): Promise<Me | null> {
  const user = (await getBrowserSupabase().auth.getUser()).data.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown };
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null,
  };
}

/** Save my name on my account and on every team and club I'm on. */
export async function saveMyName(name: string): Promise<void> {
  const sb = getBrowserSupabase();
  check(await sb.rpc("set_my_name", { p_name: name }));
  const { error } = await sb.auth.updateUser({ data: { full_name: name.trim() } });
  if (error) throw new Error(error.message);
}

export interface MyPlayer {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  teamId: string;
  teamName: string;
}

/** Kids I'm linked to as a parent, on every team. */
export async function myPlayers(userId: string): Promise<MyPlayer[]> {
  const rows = check<
    {
      player: {
        id: string;
        name: string;
        jersey_number: number | null;
        team_id: string;
        team: { name: string } | null;
      } | null;
    }[]
  >(
    await getBrowserSupabase()
      .from("player_guardian")
      .select("player:player_id(id, name, jersey_number, team_id, team:team_id(name))")
      .eq("user_id", userId),
  );
  return rows
    .flatMap((r) => (r.player ? [r.player] : []))
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      jerseyNumber: p.jersey_number,
      teamId: p.team_id,
      teamName: p.team?.name ?? "Team",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MyTeamClub {
  teamId: string;
  teamName: string;
  club: string;
  season: string;
  expiresOn: string;
}

/** My teams that belong to a club this season (coaches and managers can see their codes). */
export async function myTeamClubs(): Promise<MyTeamClub[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = check<
    {
      team_id: string;
      season_label: string;
      expires_on: string;
      organization: { name: string } | null;
      team: { name: string } | null;
    }[]
  >(
    await getBrowserSupabase()
      .from("club_code")
      .select(
        "team_id, season_label, expires_on, organization:organization_id(name), team:team_id(name)",
      )
      .not("team_id", "is", null)
      .gte("expires_on", today),
  );
  return rows.map((r) => ({
    teamId: r.team_id,
    teamName: r.team?.name ?? "Team",
    club: r.organization?.name ?? "Club",
    season: r.season_label,
    expiresOn: r.expires_on,
  }));
}
