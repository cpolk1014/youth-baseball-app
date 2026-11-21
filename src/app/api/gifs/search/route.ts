import { NextResponse, type NextRequest } from "next/server";
import { gifFromGiphy } from "@/lib/chatter/gif";
import { getServerSupabase } from "@/lib/supabase/server";

const PAGE = 24;

/**
 * GIF search for Chatter (signed in): GIPHY's trending GIFs, or a search, G-rated only. The
 * key stays on the server, and only the links a post needs go back to the phone.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ error: "GIFs aren't set up yet." }, { status: 503 });
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  const offset = Math.min(
    500,
    Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0),
  );
  const params = new URLSearchParams({
    api_key: key,
    limit: String(PAGE),
    offset: String(offset),
    rating: "g",
    bundle: "messaging_non_clips",
  });
  if (q) {
    params.set("q", q);
    params.set("lang", "en");
  }
  const url = `https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`;
  try {
    const res = await fetch(url, { next: { revalidate: q ? 600 : 1800 } });
    if (!res.ok) {
      console.error("giphy failed", res.status);
      return NextResponse.json(
        { error: "GIFs aren't loading right now. Try again." },
        { status: 502 },
      );
    }
    const body = (await res.json()) as {
      data?: unknown[];
      pagination?: { total_count?: number; count?: number; offset?: number };
    };
    const gifs = (body.data ?? []).map(gifFromGiphy).filter((g) => g !== null);
    const total = body.pagination?.total_count ?? 0;
    return NextResponse.json(
      { gifs, next: offset + PAGE < total && offset + PAGE <= 500 ? offset + PAGE : null },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json(
      { error: "GIFs aren't loading right now. Try again." },
      { status: 502 },
    );
  }
}
