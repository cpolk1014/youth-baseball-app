import { PAID_FEATURE_MESSAGE, teamHasPaid } from "@/lib/billing/paywall";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_SCREENSHOTS } from "@/lib/tournaments/event";
import {
  EventReadError,
  findVenuesOnMap,
  readEvent,
  readSchedule,
  readScores,
  readTiebreak,
  readVenues,
} from "@/lib/tournaments/read.server";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 300;

// Screenshots are shrunk on the phone first; together they stay under Vercel's 4.5 MB body limit.
const MAX_TOTAL = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * A coach or manager reads screenshots (form: teamId, file, one per screenshot, up to 6):
 * a new tournament's event page and team list (returns { event }), or, with tournamentId,
 * that tournament's pool schedule and bracket (returns { schedule }), or, with kind
 * "tiebreak", an organization's tie-break rules (returns { rules }), or, with kind "scores" and
 * tournamentId (anyone on the team), final scores (returns { scores }), or, with kind "venue"
 * and tournamentId, the parks shown, found on the map (returns { venues }). Nothing is saved
 * until the coach confirms.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Tournaments aren't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to add a tournament.");

  const form = await request.formData().catch(() => null);
  const teamId = String(form?.get("teamId") ?? "");
  const tournamentId = String(form?.get("tournamentId") ?? "");
  const kind = String(form?.get("kind") ?? "");
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!teamId || files.length === 0) return errorResponse(400, "Add a screenshot.");
  if (files.length > MAX_SCREENSHOTS) {
    return errorResponse(413, `Use up to ${MAX_SCREENSHOTS} screenshots at a time.`);
  }

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,age_group,optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  // Anyone on the team can read scores; the rest is for coaches and managers.
  const allowed =
    kind === "scores"
      ? (roles ?? []).length > 0 && !!tournamentId
      : (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!allowed || !team) return errorResponse(403, "Only coaches and managers can do that.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");
  if (!(await teamHasPaid(supabase, teamId))) return errorResponse(402, PAID_FEATURE_MESSAGE);

  const today = new Date().toISOString().slice(0, 10);
  const context = `Today is ${today}. The team adding this is ${team.name} (${team.age_group ?? "age not set"}). List every division and its teams.`;

  let scheduleContext: string | null = null;
  let tournamentCity: string | null = null;
  if (tournamentId && kind !== "tiebreak") {
    const [{ data: t }, { data: teams }] = await Promise.all([
      supabase
        .from("tournament")
        .select("team_id,name,start_date,end_date,division,venues,city")
        .eq("id", tournamentId)
        .maybeSingle(),
      supabase.from("tournament_team").select("name,is_us").eq("tournament_id", tournamentId),
    ]);
    if (!t || t.team_id !== teamId) return errorResponse(404, "That tournament wasn't found.");
    tournamentCity = t.city;
    const us = (teams ?? []).find((x) => x.is_us)?.name;
    scheduleContext = [
      `Today is ${today}. The tournament is ${t.name}, ${t.start_date ?? "dates unknown"} to ${t.end_date ?? t.start_date ?? "unknown"}.`,
      t.division ? `List the games for the ${t.division} division.` : "",
      t.venues?.length ? `Its parks: ${t.venues.join("; ")}.` : "",
      teams?.length ? `Teams already known: ${teams.map((x) => x.name).join("; ")}.` : "",
      us ? `Our team is ${us}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  try {
    if (files.some((f) => !(IMAGE_TYPES as readonly string[]).includes(f.type))) {
      return errorResponse(415, "Use screenshots or photos (PNG or JPEG).");
    }
    if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) {
      return errorResponse(413, "Those pictures are too big together. Try fewer at a time.");
    }
    const images = await Promise.all(
      files.map(async (f) => ({
        data: Buffer.from(await f.arrayBuffer()).toString("base64"),
        mediaType: f.type as ImageType,
      })),
    );
    if (kind === "tiebreak") {
      return NextResponse.json({
        rules: await readTiebreak(
          images,
          `Today is ${today}. These are a tournament organization's rules; list the tie-breakers in order.`,
        ),
      });
    }
    if (kind === "venue" && scheduleContext) {
      const read = await readVenues(images, scheduleContext);
      return NextResponse.json({
        venues: {
          places: await findVenuesOnMap(read.venues, tournamentCity),
          warnings: read.warnings,
        },
      });
    }
    if (kind === "scores" && scheduleContext) {
      return NextResponse.json({ scores: await readScores(images, scheduleContext) });
    }
    if (scheduleContext) {
      return NextResponse.json({ schedule: await readSchedule(images, scheduleContext) });
    }
    const event = await readEvent(images, context);
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof EventReadError) return errorResponse(422, error.message);
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("tournament read failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the tournament right now. Try again.");
    }
    if (error instanceof SyntaxError)
      return errorResponse(502, "The tournament came back garbled. Try again.");
    throw error;
  }
}
