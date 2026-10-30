import { NextResponse, type NextRequest } from "next/server";
import { paAccess } from "@/lib/pa/access";
import { AudioMakerError, makeAnnouncement, makeSong, makeSoundEffect } from "@/lib/pa/elevenlabs";
import { DAILY_LIMITS, limitProblem, type GenerationKind } from "@/lib/pa/limits";
import {
  isSongStyle,
  MAX_LYRIC_LINE,
  MAX_LYRIC_LINES,
  MAX_VIBE,
  songHook,
  songRequest,
} from "@/lib/pa/songPrompt";
import { announcement, MAX_SPOKEN, scriptProblem, spokenName, spokenNumber } from "@/lib/pa/speech";
import { getServerSupabase } from "@/lib/supabase/server";

// Songs can take a while to compose.
export const maxDuration = 120;

const MAX_SOUND_TEXT = 120;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Make an AI clip: a kid's walk-up song or announcer call (coaches, managers, and that
 * kid's parents), or a soundboard sound (coaches and managers). Returns MP3 bytes; the
 * browser trims and saves them.
 */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in first.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const teamId = str(body?.teamId, 40);
  const kind = body?.kind as GenerationKind;
  if (!teamId || !["song", "announce", "sound"].includes(kind)) {
    return errorResponse(400, "Something's missing. Reload and try again.");
  }

  const access = await paAccess(
    supabase,
    user.id,
    teamId,
    kind === "sound" ? null : str(body?.playerId, 40),
  );
  if (!access.ok) return errorResponse(access.status, access.error);
  const { player } = access;

  const { data: usage, error: usageError } = await supabase
    .rpc("pa_usage", { p_team_id: teamId, p_kind: kind })
    .single<{ mine: number; team: number }>();
  if (usageError || !usage) return errorResponse(500, "Couldn't check today's limit. Try again.");
  const limit = DAILY_LIMITS[kind];
  let oldestMine: string | null = null;
  if (usage.mine >= Math.min(limit.perUser, limit.perStaff)) {
    // When their oldest clip of the last day drops off, so the message can say when.
    const { data: oldest } = await supabase
      .from("pa_generation")
      .select("created_at")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .eq("kind", kind)
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at")
      .limit(1);
    oldestMine = (oldest?.[0] as { created_at: string } | undefined)?.created_at ?? null;
  }
  const tooMany = limitProblem(kind, usage, { staff: access.staff, oldestMine });
  if (tooMany) return errorResponse(429, tooMany);

  const call = player && {
    rosterName: player.name,
    jerseyNumber: player.jersey_number,
    nameSpoken: str(body?.nameSpoken, MAX_SPOKEN),
    numberSpoken: str(body?.numberSpoken, MAX_SPOKEN),
    script: str(body?.script, 200),
  };

  let audio: ArrayBuffer;
  try {
    if (kind === "song") {
      if (!isSongStyle(body?.style)) return errorResponse(400, "Pick a style first.");
      const hook =
        body?.singName === true ? songHook(spokenName(call!), spokenNumber(call!)) : null;
      audio = await makeSong(
        songRequest({
          style: body.style,
          vibe: str(body?.vibe, MAX_VIBE),
          hook,
          lyrics: str(body?.lyrics, (MAX_LYRIC_LINE + 1) * MAX_LYRIC_LINES * 2),
        }),
      );
    } else if (kind === "announce") {
      const problem = scriptProblem(call!.script);
      if (problem) return errorResponse(400, problem);
      audio = await makeAnnouncement(announcement(call!));
    } else {
      const text = str(body?.text, MAX_SOUND_TEXT);
      if (!text) return errorResponse(400, "Describe the sound first.");
      const seconds = Math.min(10, Math.max(0.5, Number(body?.seconds) || 3));
      audio = await makeSoundEffect(text, seconds);
    }
  } catch (e) {
    if (e instanceof AudioMakerError) return errorResponse(e.status, e.message);
    throw e;
  }

  await supabase.from("pa_generation").insert({ team_id: teamId, user_id: user.id, kind });
  return new NextResponse(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
