// Who can make AI clips for a team (server side, as the signed-in user so RLS applies).
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaAccess =
  | {
      ok: true;
      staff: boolean;
      team: { name: string; age_group: string };
      player: { name: string; jersey_number: number | null } | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Coaches and managers can make anything for their team; parents only walk-ups for their
 * own kids. Pass a playerId for walk-up clips.
 */
export async function paAccess(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
  playerId: string | null,
): Promise<PaAccess> {
  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", userId),
    supabase.from("team").select("name, age_group, optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  if (!team || !roles?.length) return { ok: false, status: 403, error: "You're not on this team." };
  if (team.optioned_at) {
    return { ok: false, status: 409, error: "This team is optioned. Call it up first." };
  }
  const staff = roles.some((r) => ["owner", "coach", "manager"].includes(r.role));
  const teamInfo = { name: team.name as string, age_group: (team.age_group ?? "") as string };
  if (playerId === null) {
    if (!staff) {
      return { ok: false, status: 403, error: "Only coaches and managers add soundboard sounds." };
    }
    return { ok: true, staff, team: teamInfo, player: null };
  }
  const [{ data: player }, { data: link }] = await Promise.all([
    supabase
      .from("player")
      .select("name, jersey_number")
      .eq("id", playerId)
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase
      .from("player_guardian")
      .select("id")
      .eq("player_id", playerId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!player) return { ok: false, status: 404, error: "That player isn't on this team." };
  if (!staff && !link) {
    return { ok: false, status: 403, error: "Parents can only make walk-ups for their own kids." };
  }
  return { ok: true, staff, team: teamInfo, player };
}
