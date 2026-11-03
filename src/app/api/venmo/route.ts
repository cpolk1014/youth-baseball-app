import { NextResponse, type NextRequest } from "next/server";
import { venmoPayUrl } from "@/lib/venmo/handle";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * "Pay with Venmo" on Coaches & parents: sends a teammate straight to Venmo for this person,
 * without the app ever showing or sending their handle. Only for two people on the same team.
 */
export async function GET(request: NextRequest) {
  const team = request.nextUrl.searchParams.get("team") ?? "";
  const user = request.nextUrl.searchParams.get("user") ?? "";
  const back = new URL(`/members?venmo=unavailable`, request.nextUrl.origin);
  if (!UUID.test(team) || !UUID.test(user)) return NextResponse.redirect(back);

  const supabase = await getServerSupabase();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (!me) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));

  // Both on this team (the database only shows a team's members to its members).
  const { data: members } = await supabase
    .from("member")
    .select("user_id")
    .eq("team_id", team)
    .in("user_id", [me.id, user]);
  const ids = new Set((members ?? []).map((m) => m.user_id));
  if (!ids.has(me.id) || !ids.has(user)) return NextResponse.redirect(back);

  try {
    const { data } = await getAdminSupabase()
      .from("profile")
      .select("venmo")
      .eq("user_id", user)
      .maybeSingle();
    if (!data?.venmo) return NextResponse.redirect(back);
    return NextResponse.redirect(venmoPayUrl(data.venmo));
  } catch (e) {
    console.error("venmo lookup failed", e instanceof Error ? e.message : e);
    return NextResponse.redirect(back);
  }
}
