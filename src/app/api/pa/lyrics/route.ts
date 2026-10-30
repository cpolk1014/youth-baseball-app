import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { paAccess } from "@/lib/pa/access";
import {
  cleanLyricOptions,
  isLyricTheme,
  lyricsRequest,
  lyricsSchema,
  LYRICS_SYSTEM_PROMPT,
} from "@/lib/pa/lyrics";
import { isSongStyle, MAX_VIBE, SONG_STYLES } from "@/lib/pa/songPrompt";
import { MAX_SPOKEN, spokenName, spokenNumber } from "@/lib/pa/speech";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Claude writes three lyric options for a kid's walk-up, from a theme the family picks. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Lyric writing isn't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in first.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const teamId = str(body?.teamId, 40);
  const playerId = str(body?.playerId, 40);
  if (!teamId || !playerId) return errorResponse(400, "Something's missing. Reload and try again.");
  if (!isLyricTheme(body?.theme)) return errorResponse(400, "Pick a theme first.");
  const style = isSongStyle(body?.style) ? body.style : "rock";

  const access = await paAccess(supabase, user.id, teamId, playerId);
  if (!access.ok) return errorResponse(access.status, access.error);
  const call = {
    rosterName: access.player!.name,
    jerseyNumber: access.player!.jersey_number,
    nameSpoken: str(body?.nameSpoken, MAX_SPOKEN),
    numberSpoken: str(body?.numberSpoken, MAX_SPOKEN),
  };

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: LYRICS_SYSTEM_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: lyricsSchema } },
      messages: [
        {
          role: "user",
          content: lyricsRequest({
            theme: body.theme,
            styleLabel: SONG_STYLES.find((s) => s.id === style)!.label,
            name: spokenName(call),
            number: spokenNumber(call),
            teamName: access.team.name,
            ageGroup: access.team.age_group,
            hookFirst: body?.hookFirst === true,
            idea: str(body?.idea, MAX_VIBE),
          }),
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "Couldn't write lyrics for that. Try a different theme or idea.");
    }
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return errorResponse(502, "No lyrics came back. Try again.");
    }
    const options = cleanLyricOptions(JSON.parse(block.text));
    if (!options.length) return errorResponse(502, "No lyrics came back. Try again.");
    return NextResponse.json({ options });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("lyrics failed", error.status, error.message);
      return errorResponse(502, "Couldn't write lyrics right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The lyrics came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
