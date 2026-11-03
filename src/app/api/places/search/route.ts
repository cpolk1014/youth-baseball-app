import { NextResponse, type NextRequest } from "next/server";
import { PlacesUnavailable, searchPlaces } from "@/lib/places/google";
import { getServerSupabase } from "@/lib/supabase/server";

/** Suggestions while a coach types a game's location. Signed-in users only. */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    input?: unknown;
    session?: unknown;
  } | null;
  const input = typeof body?.input === "string" ? body.input.trim().slice(0, 100) : "";
  const session = typeof body?.session === "string" ? body.session.slice(0, 64) : "";
  if (input.length < 3 || !session) return NextResponse.json({ places: [] });
  try {
    return NextResponse.json({ places: await searchPlaces(input, session) });
  } catch (e) {
    if (!(e instanceof PlacesUnavailable)) console.error("place search failed", e);
    return NextResponse.json({ error: "Place search isn't available right now." }, { status: 503 });
  }
}
