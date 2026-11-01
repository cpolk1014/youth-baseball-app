import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { cleanFlyerCombos } from "@/lib/uniforms";

// Reading a picture can take a little while.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const piece = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    combos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          shirt: piece,
          pants: piece,
          hat: piece,
          belt: piece,
          socks: piece,
        },
        required: ["name", "shirt", "pants", "hat", "belt", "socks"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["combos", "warnings"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read youth baseball uniform flyers (pictures or PDFs showing a team's uniform looks) and list each uniform combo for a team app.

Rules:
- One combo per complete look shown (usually one per mannequin or player). Don't invent combos that aren't pictured or written.
- Name each combo the way the flyer does (e.g. "Home", "Away", "Alternate"). If it doesn't name them, use a short name from the main color, like "White combo" or "Black combo".
- For each piece (shirt, pants, hat, belt, socks), give a short color description of 1 to 4 words, main color first, e.g. "White", "Black", "White, red sleeves", "Black, red brim", "Gray, red piping". Use plain color names.
- Use null for a piece you can't see or that isn't listed (for example, socks hidden under full-length pants), and add a warning naming the piece and combo.
- Ignore logos, numbers, cleats, sponsor text and backgrounds.
- If the picture isn't a uniform flyer, return no combos and a warning saying so.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Coach or manager uploads a uniform flyer; returns the combos found, to review before saving. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Flyer reading isn't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to read a flyer.");

  const form = await request.formData();
  const file = form.get("file");
  const teamId = form.get("teamId");
  if (!(file instanceof File) || typeof teamId !== "string") {
    return errorResponse(400, "Choose a picture of the flyer.");
  }
  if (file.size > MAX_BYTES) return errorResponse(413, "That file is too big. Try one under 4 MB.");

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name,optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  const allowed = (roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role));
  if (!allowed || !team) return errorResponse(403, "Only coaches and managers set up uniforms.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");

  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  let source: Anthropic.Beta.BetaContentBlockParam;
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    source = {
      type: "image",
      source: { type: "base64", media_type: file.type as ImageType, data: bytes },
    };
  } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    source = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: bytes },
    };
  } else {
    return errorResponse(415, "Use a photo, screenshot or PDF of the flyer.");
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            source,
            { type: "text", text: `Team: ${team.name}. List the uniform combos in this flyer.` },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "This picture couldn't be read as a uniform flyer.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return errorResponse(502, "Nothing came back. Try again.");
    const raw = JSON.parse(text.text) as { warnings?: unknown };
    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === "string").slice(0, 10)
      : [];
    return NextResponse.json({ combos: cleanFlyerCombos(raw), warnings });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("uniform flyer read failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the flyer right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The flyer came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
