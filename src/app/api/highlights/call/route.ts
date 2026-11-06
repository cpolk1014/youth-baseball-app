import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import {
  callProblem,
  firstName,
  isPlayId,
  MAX_CALL,
  MAX_DETAIL,
  playOf,
} from "@/lib/highlights/plays";
import { AudioMakerError, makeAnnouncement } from "@/lib/pa/elevenlabs";
import { limitProblem } from "@/lib/pa/limits";
import { numberWords } from "@/lib/pa/speech";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const SYSTEM_PROMPT = `You write the play-by-play call for a youth baseball highlight video, read aloud by an excited stadium announcer.
Rules:
- Write exactly 3 different calls, each 8 to 22 words. Use "..." for dramatic pauses and CAPS on the one big word.
- Name only the player you're given (first name, and the jersey number in words when given). Never invent or include other children's names, even if the parent's note mentions them; say "the runner" or "the shortstop" instead.
- Kid-safe and kind: no put-downs of the other team, no swearing, no violence words, nothing about anyone's body.
- Original wording. Don't use famous broadcasters' trademark catchphrases.
- Match what actually happened from the play and the parent's note; don't make up extra results like a score.`;

const SCHEMA = {
  type: "object",
  properties: {
    calls: { type: "array", items: { type: "string" } },
  },
  required: ["calls"],
  additionalProperties: false,
};

/**
 * Pine Tar Productions (My player, parents with Player stats for this kid):
 * action "write" returns 3 announcer calls for the play; action "voice" returns the
 * announcer reading one (MP3). The video itself is made and kept on the phone.
 */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in first.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const playerId = str(body?.playerId, 40);
  const action = body?.action;
  if (!playerId || (action !== "write" && action !== "voice")) {
    return errorResponse(400, "Something's missing. Reload and try again.");
  }

  // Only the kid's own linked parent (RLS shows families just their own links).
  const { data: link } = await supabase
    .from("player_guardian")
    .select("player_id")
    .eq("player_id", playerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return errorResponse(403, "You can only make highlights of your own player.");
  const { data: player } = await supabase
    .from("player")
    .select("name, team_id, jersey_number, athlete_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return errorResponse(404, "That player isn't on a team you're on.");
  // Part of Player stats, the family add-on.
  const { data: paid } = player.athlete_id
    ? await supabase.rpc("family_access", { p_athlete: player.athlete_id })
    : { data: false };
  if (!paid) {
    return errorResponse(
      402,
      "Pine Tar Productions comes with Player stats. Unlock it on My profile.",
    );
  }

  if (action === "write") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return errorResponse(503, "AI isn't set up yet (missing ANTHROPIC_API_KEY).");
    }
    if (!isPlayId(body?.play)) return errorResponse(400, "Pick the play first.");
    const play = playOf(body.play);
    const detail = str(body?.detail, MAX_DETAIL);
    const { data: team } = await supabase
      .from("team")
      .select("age_group")
      .eq("id", player.team_id)
      .maybeSingle();
    const context = [
      `Player: ${firstName(player.name)}${player.jersey_number === null ? "" : `, number ${numberWords(player.jersey_number)}`}.`,
      `Age group: ${team?.age_group ?? "youth"}.`,
      `Play: ${play.label}.`,
      detail ? `Parent's note about the play: ${detail}` : "No extra note.",
    ].join("\n");
    const client = new Anthropic();
    try {
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 1000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: context }],
      });
      if (response.stop_reason === "refusal") {
        return errorResponse(422, "That one couldn't be written. Try a different note.");
      }
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text")
        return errorResponse(502, "No call came back. Try again.");
      const parsed = JSON.parse(block.text) as { calls?: unknown };
      const raw: unknown[] = Array.isArray(parsed.calls) ? parsed.calls : [];
      const calls = raw
        .filter((c): c is string => typeof c === "string" && !callProblem(c))
        .map((c) => c.trim().slice(0, MAX_CALL))
        .slice(0, 3);
      if (!calls.length) return errorResponse(502, "No call came back. Try again.");
      return NextResponse.json({ calls });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return errorResponse(429, "Too many requests right now. Try again in a minute.");
      }
      if (error instanceof Anthropic.APIError) {
        console.error("highlight call failed", error.status, error.message);
        return errorResponse(502, "Couldn't write the call right now. Try again.");
      }
      if (error instanceof SyntaxError)
        return errorResponse(502, "Something went wrong. Try again.");
      throw error;
    }
  }

  // action === "voice": the announcer reads it. Counts toward the same daily limit as
  // walk-up announcer calls.
  const script = str(body?.script, MAX_CALL + 20);
  const problem = callProblem(script);
  if (problem) return errorResponse(400, problem);
  const { data: usage, error: usageError } = await supabase
    .rpc("pa_usage", { p_team_id: player.team_id, p_kind: "announce" })
    .single<{ mine: number; team: number }>();
  if (usageError || !usage) return errorResponse(500, "Couldn't check today's limit. Try again.");
  const tooMany = limitProblem("announce", usage, { staff: false });
  if (tooMany) return errorResponse(429, tooMany);
  let audio: ArrayBuffer;
  try {
    audio = await makeAnnouncement(script);
  } catch (e) {
    if (e instanceof AudioMakerError) return errorResponse(e.status, e.message);
    throw e;
  }
  await supabase
    .from("pa_generation")
    .insert({ team_id: player.team_id, user_id: user.id, kind: "announce" });
  return new NextResponse(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
