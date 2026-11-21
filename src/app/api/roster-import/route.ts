import Anthropic from "@anthropic-ai/sdk";
import { beginAi } from "@/lib/ai/ledger.server";
import { NextResponse, type NextRequest } from "next/server";
import { PAID_FEATURE_MESSAGE, teamHasPaid } from "@/lib/billing/paywall";
import { ROSTER_PROMPT } from "@/lib/roster-import/prompt";
import { ROSTER_JSON_SCHEMA, cleanRoster } from "@/lib/roster-import/review";
import { getServerSupabase } from "@/lib/supabase/server";

// Reading a roster file can take a little while.
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** A coach or manager uploads a roster file; returns the players found (nothing is saved). */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Roster import isn't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to import a roster.");

  const form = await request.formData();
  const file = form.get("file");
  const teamId = form.get("teamId");
  if (!(file instanceof File) || typeof teamId !== "string") {
    return errorResponse(400, "Choose a file to import.");
  }
  if (file.size > MAX_BYTES) return errorResponse(413, "That file is too big. Try one under 4 MB.");

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,age_group").eq("id", teamId).maybeSingle(),
  ]);
  const canImport = (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!canImport || !team)
    return errorResponse(403, "Only coaches and managers can import a roster.");
  if (!(await teamHasPaid(supabase, teamId))) return errorResponse(402, PAID_FEATURE_MESSAGE);

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
  } else if (
    file.type.startsWith("text/") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".txt")
  ) {
    source = { type: "text", text: `Roster file "${file.name}":\n\n${bytes.toString("utf8")}` };
  } else {
    return errorResponse(
      415,
      "Use a screenshot or photo, a PDF, or a CSV. (From Excel or Google Sheets, save as CSV first.)",
    );
  }

  const ai = await beginAi(supabase, { teamId }, "roster");
  if (!ai.ok) return ai.response;
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: ROSTER_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ROSTER_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            source,
            { type: "text", text: `Team: ${team.name} (${team.age_group}). List the players.` },
          ],
        },
      ],
    });
    await ai.call.claude(response, "claude-opus-5-5");
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "This file couldn't be read as a roster.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return errorResponse(502, "No roster came back. Try again.");
    return NextResponse.json(cleanRoster(JSON.parse(text.text)));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many imports right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("roster import failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the file right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The roster came back in an unexpected format. Try again.");
    }
    throw error;
  } finally {
    await ai.call.finish();
  }
}
