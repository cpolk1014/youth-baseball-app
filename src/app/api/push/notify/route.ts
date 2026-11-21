import { NextResponse, type NextRequest } from "next/server";
import { chatterPush, coachPush } from "@/lib/push/payload";
import { firstTime, pushConfigured, sendPush } from "@/lib/push/send.server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

/** Only posts this new are announced (the app asks right after posting). */
const FRESH_MS = 5 * 60 * 1000;

const ok = (sent = 0) => NextResponse.json({ sent });
const fresh = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < FRESH_MS;

/**
 * The app calls this right after someone posts, so the rest of the team (or the club's
 * coaches) get a notification. Each post is announced once, only by its author, only while
 * new. kind: "chatter" (a team post or poll), "club" (a club's post to its teams), "coach"
 * (Coach Chatter).
 */
export async function POST(request: NextRequest) {
  if (!pushConfigured()) return ok();
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: string; id?: string } | null;
  const kind = body?.kind;
  const id = typeof body?.id === "string" ? body.id.slice(0, 40) : "";
  if (!id || !["chatter", "club", "coach"].includes(kind ?? "")) {
    return NextResponse.json({ error: "Nothing to announce." }, { status: 400 });
  }
  const admin = getAdminSupabase();
  const nameOn = async (teamId: string, userId: string) => {
    const { data } = await admin
      .from("member")
      .select("display_name, role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = data?.role as string | undefined;
    return (
      (data?.display_name as string | null)?.trim() ||
      (role === "owner" || role === "coach" ? "Coach" : role === "manager" ? "Manager" : "A parent")
    );
  };
  // Everyone who has joined the team's Chatter (agreed to its rules), but not the poster.
  const teamReaders = async (teamId: string, except: string | null) => {
    const { data } = await admin
      .from("chatter_member")
      .select("user_id")
      .eq("team_id", teamId)
      .not("agreed_at", "is", null);
    return (data ?? []).map((r) => r.user_id as string).filter((u) => u !== except);
  };

  if (kind === "chatter") {
    // Read as the person: it must be their own post on a team they're on.
    const { data: post } = await supabase
      .from("chatter_post")
      .select("id, team_id, author_id, body, photos, gif, kind, created_at, removed_at")
      .eq("id", id)
      .maybeSingle();
    if (!post || post.author_id !== user.id || post.removed_at || !fresh(post.created_at)) {
      return ok();
    }
    if (!(await firstTime("chatter", id))) return ok();
    const { data: team } = await admin
      .from("team")
      .select("name, notify_chatter")
      .eq("id", post.team_id)
      .maybeSingle();
    // The coaches turned Chatter notifications off for the team.
    if (team && team.notify_chatter === false) return ok();
    const sent = await sendPush(
      await teamReaders(post.team_id, user.id),
      { id: post.team_id, category: "chatter" },
      chatterPush({
        teamId: post.team_id,
        teamName: (team?.name as string) ?? "Chatter",
        from: await nameOn(post.team_id, user.id),
        post,
      }),
    );
    return ok(sent);
  }

  if (kind === "club") {
    // Read as the person: club admins read their club's posts; it must be theirs.
    const { data: post } = await supabase
      .from("club_chatter_post")
      .select("id, organization_id, author_id, body, photos, kind, created_at, removed_at")
      .eq("id", id)
      .maybeSingle();
    if (!post || post.author_id !== user.id || post.removed_at || !fresh(post.created_at)) {
      return ok();
    }
    if (!(await firstTime("club", id))) return ok();
    const [{ data: club }, { data: copies }] = await Promise.all([
      admin.from("organization").select("name").eq("id", post.organization_id).maybeSingle(),
      admin.from("chatter_post").select("team_id").eq("club_post_id", id),
    ]);
    const teamIds = [...new Set((copies ?? []).map((c) => c.team_id as string))];
    if (!teamIds.length) return ok();
    const { data: teams } = await admin
      .from("team")
      .select("id, name, notify_chatter")
      .in("id", teamIds);
    let sent = 0;
    for (const t of (teams ?? []).filter((x) => x.notify_chatter !== false)) {
      sent += await sendPush(
        await teamReaders(t.id as string, null),
        { id: t.id as string, category: "chatter" },
        chatterPush({
          teamId: t.id as string,
          teamName: t.name as string,
          from: (club?.name as string) ?? "Your club",
          post,
        }),
      );
    }
    return ok(sent);
  }

  // Coach Chatter: read as the person (only the club's coaches and admins can).
  const { data: post } = await supabase
    .from("club_coach_post")
    .select("id, organization_id, author_id, body, photos, gif, created_at, removed_at")
    .eq("id", id)
    .maybeSingle();
  if (!post || post.author_id !== user.id || post.removed_at || !fresh(post.created_at)) {
    return ok();
  }
  if (!(await firstTime("coach", id))) return ok();
  const [{ data: people }, { data: club }] = await Promise.all([
    supabase.rpc("club_coach_people", { p_org: post.organization_id }),
    admin.from("organization").select("name").eq("id", post.organization_id).maybeSingle(),
  ]);
  const rows = (people ?? []) as { user_id: string; name: string | null; admin: boolean }[];
  const me = rows.find((r) => r.user_id === user.id);
  const sent = await sendPush(
    rows.map((r) => r.user_id).filter((u) => u !== user.id),
    { id: post.organization_id, category: "coach_chatter" },
    coachPush({
      clubId: post.organization_id,
      clubName: (club?.name as string) ?? "your club",
      from: me?.name?.trim() || (me?.admin ? "The club" : "A coach"),
      post,
    }),
  );
  return ok(sent);
}
