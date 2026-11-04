import { NextResponse, type NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { checkTournament } from "@/lib/tournaments/read.server";

// Checking a batch of event pages takes a while.
export const maxDuration = 300;

/** At most this many tournaments per weekly run. */
const BATCH = 40;

/**
 * Weekly (Vercel Cron): re-read each upcoming tournament's link and add new teams in its
 * division. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY." }, { status: 503 });
  }
  const admin = getAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("tournament")
    .select("id,url,division,page_hash,team_id,checked_at,team:team_id(age_group,optioned_at)")
    .not("url", "is", null)
    // Until the tournament starts.
    .or(`start_date.is.null,start_date.gt.${today}`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH * 3);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  // Not checked in the last six days (a coach may have just tapped Check now).
  const due = (data ?? []).filter((t) => !t.checked_at || t.checked_at < weekAgo).slice(0, BATCH);
  for (const t of due) {
    const team = (Array.isArray(t.team) ? t.team[0] : t.team) as {
      age_group: string | null;
      optioned_at: string | null;
    } | null;
    if (team?.optioned_at) continue;
    const r = await checkTournament(admin, t, team?.age_group ?? null);
    results.push({ id: t.id, added: r.added.length });
  }
  return NextResponse.json({ checked: results.length, results });
}

/** A coach or manager checks one tournament now. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Tournaments aren't set up yet." }, { status: 503 });
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { tournamentId?: unknown } | null;
  const id = typeof body?.tournamentId === "string" ? body.tournamentId : "";
  const { data: t } = await supabase
    .from("tournament")
    .select("id,url,division,page_hash,team_id,team:team_id(age_group)")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  const { data: roles } = await supabase
    .from("member")
    .select("role")
    .eq("team_id", t.team_id)
    .eq("user_id", user.id);
  if (!(roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role))) {
    return NextResponse.json({ error: "Only coaches and managers can check." }, { status: 403 });
  }
  const team = (Array.isArray(t.team) ? t.team[0] : t.team) as { age_group: string | null } | null;
  // The coach's own client: RLS still applies to what's added.
  const r = await checkTournament(supabase, { ...t, page_hash: null }, team?.age_group ?? null);
  return NextResponse.json(r);
}
