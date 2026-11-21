import { NextResponse } from "next/server";
import {
  chargesPush,
  chatterPush,
  gamesPush,
  type ChargeEvent,
  type GameEvent,
} from "@/lib/push/payload";
import { firstTime, pushConfigured, sendPush } from "@/lib/push/send.server";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Sends the team notices that are due (game changes, new charges). Supabase calls this every
 * 5 minutes (start_team_notifications). It needs no sign-in and is safe to call any time:
 * the database decides what's due (settled for 10 minutes, daytime, the team still sends that
 * kind) and hands each notice out only once.
 */
export async function POST() {
  if (!pushConfigured()) return NextResponse.json({ sent: 0 });
  const { data, error } = await getAdminSupabase().rpc("take_due_notifications");
  if (error) {
    console.error("take_due_notifications failed", error.message);
    return NextResponse.json({ sent: 0 }, { status: 500 });
  }
  const rows = (data ?? []) as {
    team_id: string;
    team_name: string;
    kind: "games" | "money";
    user_ids: string[];
    events: unknown[];
  }[];
  let sent = 0;
  for (const row of rows) {
    const payload =
      row.kind === "games"
        ? gamesPush(row.team_id, row.team_name, row.events as GameEvent[])
        : chargesPush(row.team_id, row.team_name, row.events as ChargeEvent[]);
    sent += await sendPush(row.user_ids, { id: row.team_id, category: row.kind }, payload);
  }
  sent += await announceFungoPosts();
  return NextResponse.json({ sent });
}

/** Fungo's own posts (the automatic game day post), announced once to the team's Chatter. */
async function announceFungoPosts(): Promise<number> {
  const admin = getAdminSupabase();
  const { data: posts } = await admin
    .from("chatter_post")
    .select("id, team_id, body, photos, kind, created_at")
    .eq("from_fungo", true)
    .is("removed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  let sent = 0;
  for (const post of posts ?? []) {
    if (!(await firstTime("chatter", post.id as string))) continue;
    const { data: team } = await admin
      .from("team")
      .select("name, notify_chatter")
      .eq("id", post.team_id)
      .maybeSingle();
    if (!team || team.notify_chatter === false) continue;
    const { data: readers } = await admin
      .from("chatter_member")
      .select("user_id")
      .eq("team_id", post.team_id)
      .not("agreed_at", "is", null);
    sent += await sendPush(
      (readers ?? []).map((r) => r.user_id as string),
      { id: post.team_id as string, category: "chatter" },
      chatterPush({
        teamId: post.team_id as string,
        teamName: team.name as string,
        from: "Fungo",
        post: {
          body: post.body as string,
          photos: post.photos as unknown[],
          kind: post.kind as string,
        },
      }),
    );
  }
  return sent;
}
