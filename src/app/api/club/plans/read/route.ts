import { CLUB_PAID_FEATURE_MESSAGE, clubHasPaid } from "@/lib/billing/paywall";
import Anthropic from "@anthropic-ai/sdk";
import { beginAi } from "@/lib/ai/ledger.server";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  MAX_PLAN_FILES,
  PLAN_READ_PROMPT,
  PLAN_READ_SCHEMA,
  cleanReadPlans,
} from "@/lib/practice/planRead";

// A few pages of drill instructions take a while to read.
export const maxDuration = 120;

const MAX_TOTAL = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MODEL = "claude-opus-5-5";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * A club admin uploads practice plans (PDFs, photos or screenshots); returns the plans and
 * drills found, to review and edit before saving them to the club's Library.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Plan reading isn't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to read practice plans.");

  const form = await request.formData().catch(() => null);
  const clubId = form?.get("clubId");
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (typeof clubId !== "string" || files.length === 0) {
    return errorResponse(400, "Choose a PDF or picture of the practice plans.");
  }
  if (files.length > MAX_PLAN_FILES) {
    return errorResponse(400, `Up to ${MAX_PLAN_FILES} files at a time.`);
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) {
    return errorResponse(413, "Those files are too big together. Try fewer, or under 4 MB.");
  }

  const [{ data: admin }, { data: club }] = await Promise.all([
    supabase
      .from("club_admin")
      .select("role")
      .eq("organization_id", clubId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("organization").select("name").eq("id", clubId).maybeSingle(),
  ]);
  if (!admin || !club) return errorResponse(403, "Only club admins add club practice plans.");
  if (!(await clubHasPaid(supabase, clubId))) return errorResponse(402, CLUB_PAID_FEATURE_MESSAGE);

  const sources: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
      sources.push({
        type: "image",
        source: { type: "base64", media_type: file.type as ImageType, data },
      });
    } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      sources.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      });
    } else {
      return errorResponse(415, "Use a PDF, photo or screenshot of the practice plans.");
    }
  }

  const ai = await beginAi(supabase, { clubId }, "club_plan");
  if (!ai.ok) return ai.response;
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: PLAN_READ_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: PLAN_READ_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...sources,
            {
              type: "text",
              text: `Club: ${club.name}. List the practice plans and their drills in ${files.length === 1 ? "this file" : `these ${files.length} files`}.`,
            },
          ],
        },
      ],
    });
    await ai.call.claude(response, MODEL);
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "This file couldn't be read as practice plans.");
    }
    if (response.stop_reason === "max_tokens") {
      return errorResponse(422, "That's a lot of plans for one read. Try fewer pages at a time.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return errorResponse(502, "Nothing came back. Try again.");
    return NextResponse.json(cleanReadPlans(JSON.parse(text.text)));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("club plan read failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the plans right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The plans came back in an unexpected format. Try again.");
    }
    throw error;
  } finally {
    await ai.call.finish();
  }
}
