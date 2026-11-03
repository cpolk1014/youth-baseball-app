import { NextResponse, type NextRequest } from "next/server";
import { PlacesUnavailable, placeDetails } from "@/lib/places/google";
import { getServerSupabase } from "@/lib/supabase/server";

/** The address and map position of the place a coach picked. Signed-in users only. */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    placeId?: unknown;
    session?: unknown;
  } | null;
  const placeId = typeof body?.placeId === "string" ? body.placeId.slice(0, 300) : "";
  const session = typeof body?.session === "string" ? body.session.slice(0, 64) : "";
  if (!/^[A-Za-z0-9_-]+$/.test(placeId)) {
    return NextResponse.json({ error: "Pick a place from the list." }, { status: 400 });
  }
  try {
    return NextResponse.json(await placeDetails(placeId, session));
  } catch (e) {
    if (!(e instanceof PlacesUnavailable)) console.error("place details failed", e);
    return NextResponse.json({ error: "Couldn't look up that place right now." }, { status: 503 });
  }
}
