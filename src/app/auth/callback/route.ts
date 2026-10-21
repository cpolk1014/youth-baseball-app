import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/supabase/next-path";
import { getServerSupabase } from "@/lib/supabase/server";

/** Magic-link landing: trade the one-time code for a session, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
