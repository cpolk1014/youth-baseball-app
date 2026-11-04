import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_SCREENSHOTS } from "@/lib/tournaments/event";
import { EventReadError, readEvent } from "@/lib/tournaments/read.server";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

// Screenshots are shrunk on the phone first; together they stay under Vercel's 4.5 MB body limit.
const MAX_TOTAL = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * A coach or manager reads a tournament from screenshots of its event page and team list
 * (form: teamId, file, one per screenshot, up to 6). Returns the event's details and teams; nothing is saved until the
 * coach confirms.
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
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!teamId || files.length === 0) return errorResponse(400, "Add a screenshot.");
  if (files.length > MAX_SCREENSHOTS) {
    return errorResponse(413, `Use up to ${MAX_SCREENSHOTS} screenshots at a time.`);
  }

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,age_group,optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  const canAdd = (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!canAdd || !team) return errorResponse(403, "Only coaches and managers can add tournaments.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");

  const context = `Today is ${new Date().toISOString().slice(0, 10)}. The team adding this is ${team.name} (${team.age_group ?? "age not set"}). List every division and its teams.`;
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
