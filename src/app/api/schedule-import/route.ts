import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { EXTRACTION_JSON_SCHEMA, type ScheduleExtraction } from "@/lib/schedule-import/schema";
import { getServerSupabase } from "@/lib/supabase/server";

// Reading a schedule file can take a little while.
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const SYSTEM_PROMPT = `You read youth baseball team schedules - photos of flyers, screenshots, PDFs and spreadsheets - and list every practice and game as individual dated events for a team app.

Rules:
- Give one entry per date. Expand recurring patterns into each date (e.g. "Mondays/Wednesdays, Nov 16, 18, 30" becomes three entries). For a recurring series with a start but no end (e.g. "Wednesdays, starting Jan 13"), continue it through the last date of that part of the season shown in the document (such as the last league game), and add a warning that says which end date you assumed.
- Schedules often leave out the year. Pick years so the events are upcoming or recent relative to today's date. When the document gives weekdays (e.g. "Monday nights"), choose the year that puts those dates on that weekday. Add a warning stating the years you assumed.
- Times are 24-hour HH:MM. Use null when no time is given.
- When one practice has back-to-back parts at different places on the same day (e.g. field 5:00-6:00, then batting cages 6:00-6:30), make it one practice covering the whole time, use the first place as the location, and describe the parts in the note.
- Games include league games, scrimmages and tournament days. Give the opponent only if the document names one. Set tentative to true for rain or make-up dates, "if needed" dates, and tournaments that are not confirmed. Leave out dates the document marks as off or canceled, and mention them in a warning.
- Put short, useful details (like "Championship league tournament" or "Bring cage bucket") in the note; otherwise use null.
- Only list events the document actually shows. If something is unreadable or ambiguous, say so in a warning instead of guessing. If the file is not a schedule, return empty lists and a warning saying so.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Coach or manager uploads a schedule file; returns the practices and games found in it. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Schedule import isn't set up yet (missing ANTHROPIC_API_KEY).");
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to import a schedule.");

  const form = await request.formData();
  const file = form.get("file");
  const teamId = form.get("teamId");
  if (!(file instanceof File) || typeof teamId !== "string") {
    return errorResponse(400, "Choose a file to import.");
  }
  if (file.size > MAX_BYTES) return errorResponse(413, "That file is too big. Try one under 4 MB.");

  // Only coaches and managers of an active team can import (RLS limits what we can see).
  const [{ data: roles }, { data: team }, { data: season }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,age_group,optioned_at").eq("id", teamId).maybeSingle(),
    supabase
      .from("season")
      .select("name")
      .eq("team_id", teamId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const canImport = (roles ?? []).some(
    (r) => r.role === "owner" || r.role === "coach" || r.role === "manager",
  );
  if (!canImport || !team)
    return errorResponse(403, "Only coaches and managers can import a schedule.");
  if (team.optioned_at)
    return errorResponse(409, "This team is optioned. Call it up to import a schedule.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let source: Anthropic.Beta.BetaContentBlockParam;
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    source = {
      type: "image",
      source: {
        type: "base64",
        media_type: file.type as ImageType,
        data: bytes.toString("base64"),
      },
    };
  } else if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    source = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
    };
  } else if (file.type.startsWith("text/") || name.endsWith(".csv") || name.endsWith(".txt")) {
    source = { type: "text", text: `Schedule file "${file.name}":\n\n${bytes.toString("utf8")}` };
  } else {
    return errorResponse(415, "Use a photo or screenshot, a PDF, or a CSV file.");
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const context = `Today is ${weekday}, ${today}. Team: ${team.name} (${team.age_group}). Current season in the app: ${season?.name ?? "unnamed"}. List every practice and game in this schedule.`;

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: [source, { type: "text", text: context }] }],
    });

    if (response.stop_reason === "refusal") {
      return errorResponse(422, "This file couldn't be read as a schedule.");
    }
    if (response.stop_reason === "max_tokens") {
      return errorResponse(
        422,
        "That schedule is too long to read in one go. Try splitting it up.",
      );
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text")
      return errorResponse(502, "No schedule came back. Try again.");
    const extraction = JSON.parse(text.text) as ScheduleExtraction;
    return NextResponse.json(extraction);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many imports right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("schedule import failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the file right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The schedule came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
