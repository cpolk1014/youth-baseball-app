import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { EventReadError, fetchEventText, readEvent } from "@/lib/tournaments/read.server";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * A coach or manager reads a tournament from its event link (JSON: teamId, url) or from a
 * screenshot of the team list (form: teamId, file). Returns the event's details and teams;
 * nothing is saved until the coach confirms.
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

  let teamId = "";
  let link: string | null = null;
  let file: File | null = null;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    teamId = String(form.get("teamId") ?? "");
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } else {
    const body = (await request.json().catch(() => null)) as {
      teamId?: unknown;
      url?: unknown;
    } | null;
    teamId = typeof body?.teamId === "string" ? body.teamId : "";
    link = typeof body?.url === "string" ? body.url : null;
  }
  if (!teamId || (!link && !file))
    return errorResponse(400, "Paste the event link or add a screenshot.");

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,age_group,optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  const canAdd = (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!canAdd || !team) return errorResponse(403, "Only coaches and managers can add tournaments.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");

  const context = `Today is ${new Date().toISOString().slice(0, 10)}. The team adding this is ${team.name} (${team.age_group ?? "age not set"}). List every division and its teams.`;
  try {
    if (file) {
      if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
        return errorResponse(415, "Use a screenshot or photo (PNG or JPEG).");
      }
      if (file.size > MAX_IMAGE)
        return errorResponse(413, "That picture is too big. Try one under 4 MB.");
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      const event = await readEvent(
        { image: { data, mediaType: file.type as ImageType } },
        context,
      );
      return NextResponse.json({ event, url: null, pageHash: null });
    }
    const page = await fetchEventText(link!);
    if (page.text.length < 40) {
      return errorResponse(
        422,
        "That page didn't have anything to read. Try a screenshot of the team list.",
      );
    }
    const event = await readEvent({ text: page.text }, context);
    return NextResponse.json({ event, url: page.url, pageHash: page.hash });
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
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return errorResponse(
        504,
        "The event page took too long to answer. Try again, or use a screenshot.",
      );
    }
    throw error;
  }
}
