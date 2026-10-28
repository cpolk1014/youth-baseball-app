import { NextResponse, type NextRequest } from "next/server";
import { groupMeBot } from "@/lib/groupme/bot";
import { ChannelError } from "@/lib/groupme/channel";
import { getServerSupabase } from "@/lib/supabase/server";

const MAX_TEXT = 6000;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Coach or manager posts a message to the team's GroupMe group through its bot. */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to post to GroupMe.");

  const body = (await request.json().catch(() => null)) as {
    teamId?: unknown;
    text?: unknown;
  } | null;
  const teamId = typeof body?.teamId === "string" ? body.teamId : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!teamId || !text) return errorResponse(400, "Write a message first.");
  if (text.length > MAX_TEXT) return errorResponse(413, "That message is too long.");

  // The database only shows the bot to the team's coaches and managers.
  const [{ data: roles }, { data: team }, { data: bot }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("optioned_at").eq("id", teamId).maybeSingle(),
    supabase.from("team_groupme").select("bot_id").eq("team_id", teamId).maybeSingle(),
  ]);
  const canPost = (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!canPost || !team)
    return errorResponse(403, "Only coaches and managers can post to GroupMe.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up to post.");
  if (!bot) return errorResponse(404, "Connect the team's GroupMe first.");

  try {
    await groupMeBot(bot.bot_id).post(text);
  } catch (e) {
    if (e instanceof ChannelError) return errorResponse(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ ok: true });
}
