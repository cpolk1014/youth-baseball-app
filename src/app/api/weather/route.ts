import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { gameWeather } from "@/lib/weather/nws.server";

/**
 * Game-time weather for a place and time (free, from the National Weather Service).
 * GET ?lat=&lng=&date=YYYY-MM-DD&time=HH:MM&hours=2. Signed-in users only.
 */
export async function GET(request: NextRequest) {
  if (isSupabaseConfigured) {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const q = request.nextUrl.searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const date = q.get("date") ?? "";
  const time = q.get("time");
  const hours = Math.min(6, Math.max(1, Math.round(Number(q.get("hours") ?? 2) || 2)));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    (time !== null && !/^\d{2}:\d{2}$/.test(time))
  ) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const result = await gameWeather({ lat, lng, date, time, hours });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=300" } });
}
