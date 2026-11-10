import { NextResponse, type NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A coach permanently deletes a team. The database removes the team's rows; its stored files
 * (logo, receipts, walk-up audio) go afterward with the service role, because once the team is
 * gone nobody's role allows it.
 */
export async function POST(request: NextRequest) {
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in first.");
  const body = (await request.json().catch(() => null)) as { teamId?: unknown } | null;
  const teamId = typeof body?.teamId === "string" && UUID.test(body.teamId) ? body.teamId : null;
  if (!teamId) return fail(400, "That team wasn't found.");

  const { data: roles } = await supabase
    .from("member")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id);
  if (!(roles ?? []).some((r) => ["owner", "coach"].includes(r.role))) {
    return fail(403, "Only a coach can delete this team.");
  }

  // The files to remove, read while the team still exists.
  const [team, receipts, walkups, sounds] = await Promise.all([
    supabase.from("team").select("logo_path").eq("id", teamId).maybeSingle(),
    supabase
      .from("finance_entry")
      .select("receipt_path, season!inner(team_id)")
      .eq("season.team_id", teamId)
      .not("receipt_path", "is", null),
    supabase
      .from("walkup")
      .select("song_path, announce_path, player!inner(team_id)")
      .eq("player.team_id", teamId),
    supabase.from("pa_sound").select("path").eq("team_id", teamId),
  ]);
  const readError = team.error ?? receipts.error ?? walkups.error ?? sounds.error;
  if (readError) {
    console.error("team delete: couldn't list files", readError.message);
    return fail(500, "Couldn't delete the team. Try again.");
  }
  const logo = team.data?.logo_path as string | null | undefined;
  const files: Record<string, string[]> = {
    "team-logos": logo && !logo.startsWith("data:") ? [logo] : [],
    receipts: (receipts.data ?? []).flatMap((r) =>
      r.receipt_path ? [r.receipt_path as string] : [],
    ),
    "pa-audio": [
      ...(walkups.data ?? []).flatMap((w) =>
        [w.song_path as string | null, w.announce_path as string | null].filter(
          (p): p is string => !!p,
        ),
      ),
      ...(sounds.data ?? []).map((s) => s.path as string),
    ],
  };

  const { data: deleted, error } = await supabase
    .from("team")
    .delete()
    .eq("id", teamId)
    .select("id");
  if (error) {
    console.error("team delete failed", error.message);
    return fail(500, "Couldn't delete the team. Try again.");
  }
  if (!deleted?.length) return fail(403, "Only a coach can delete this team.");

  // The team is gone; a leftover file is logged, not shown to the coach as a failure.
  try {
    const admin = getAdminSupabase();
    for (const [bucket, paths] of Object.entries(files)) {
      if (paths.length === 0) continue;
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) console.error("team delete: files left in", bucket, removeError.message);
    }
  } catch (e) {
    console.error("team delete: files left behind", e);
  }
  return NextResponse.json({ ok: true });
}
