import { NextResponse, type NextRequest } from "next/server";
import { chatterPush, coachPush } from "@/lib/push/payload";
import { firstTime, pushConfigured, sendPush, type PushCategory } from "@/lib/push/send.server";
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
    if (!data) {
      // Not on the team: one of the club's admins posting in the Team channel.
      const { data: codes } = await admin
        .from("club_code")
        .select("organization_id")
        .eq("team_id", teamId);
      const orgs = (codes ?? []).map((c) => c.organization_id as string);
      const { data: club } = orgs.length
        ? await admin
            .from("club_admin")
            .select("display_name, role")
            .eq("user_id", userId)
            .in("organization_id", orgs)
            .limit(1)
            .maybeSingle()
        : { data: null };
      const name = (club?.display_name as string | null)?.trim();
      const title = club?.role === "director" ? "Club director" : "Club admin";
      return name ? `${name} (${title})` : title;
    }
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
      .select(
        "id, team_id, channel, author_id, body, photos, gif, kind, mentions, created_at, removed_at",
      )
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
    const parents = post.channel === "parents";
    const teamName = `${(team?.name as string) ?? "Chatter"}${parents ? "" : " · Club"}`;
    const from = await nameOn(post.team_id, user.id);
    // Who's in this channel now: the team, plus (Team channel only) the club's current admins.
    const { data: members } = await admin
      .from("member")
      .select("user_id, role")
      .eq("team_id", post.team_id);
    const all = ((members ?? []) as { user_id: string; role: string }[]).filter((m) => m.user_id);
    const onTeam = new Set(all.map((m) => m.user_id));
    let clubAdmins = new Set<string>();
    if (!parents) {
      const { data: codes } = await admin
        .from("club_code")
        .select("organization_id")
        .eq("team_id", post.team_id)
        .gte("expires_on", new Date().toISOString().slice(0, 10));
      const orgs = [...new Set((codes ?? []).map((c) => c.organization_id as string))];
      if (orgs.length) {
        const { data: admins } = await admin
          .from("club_admin")
          .select("user_id")
          .in("organization_id", orgs);
        clubAdmins = new Set((admins ?? []).map((a) => a.user_id as string));
      }
    }
    const payload = (who: string) => {
      const base = chatterPush({ teamId: post.team_id, teamName, from: who, post });
      return parents
        ? { ...base, url: `${base.url}&channel=parents`, tag: `${base.tag}-parents` }
        : { ...base, url: `${base.url}&channel=team` };
    };
    // Club admins open the team's channel from the club page, not the team app.
    const clubPayload = (who: string) => ({
      ...payload(who),
      url: `/club/teams/${post.team_id}?view=chatter`,
    });
    const send = async (users: string[], category: PushCategory, who: string) =>
      (await sendPush(
        users.filter((u) => onTeam.has(u)),
        { id: post.team_id, category },
        payload(who),
      )) +
      (await sendPush(
        users.filter((u) => !onTeam.has(u) && clubAdmins.has(u)),
        { id: post.team_id, category },
        clubPayload(who),
      ));
    // Tagged people hear about it even if they muted the team's Chatter; then everyone else.
    const tags = ((post.mentions ?? []) as string[]).filter(Boolean);
    let tagged: string[] = [];
    if (tags.length) {
      tagged = [
        ...new Set(
          all
            .filter(
              (m) =>
                tags.includes("everyone") ||
                tags.includes(m.user_id) ||
                (tags.includes("coaches") && ["owner", "coach", "manager"].includes(m.role)),
            )
            .map((m) => m.user_id)
            .filter((u) => u && u !== user.id),
        ),
      ];
    }
    let sent = await send(tagged, "mention", `${from} tagged you`);
    sent += await send(
      (await teamReaders(post.team_id, user.id)).filter((u) => !tagged.includes(u)),
      parents ? "parents" : "chatter",
      from,
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
        (() => {
          // Club posts live in the team's Club channel.
          const base = chatterPush({
            teamId: t.id as string,
            teamName: `${t.name as string} · Club`,
            from: (club?.name as string) ?? "Your club",
            post,
          });
          return { ...base, url: `${base.url}&channel=team` };
        })(),
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
