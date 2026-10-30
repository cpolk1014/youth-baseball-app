import { NextResponse, type NextRequest } from "next/server";
import { AudioMakerError, makeAnnouncement, makeSong, makeSoundEffect } from "@/lib/pa/elevenlabs";
import { limitProblem, type GenerationKind } from "@/lib/pa/limits";
import { isSongStyle, songHook, songPrompt, MAX_VIBE } from "@/lib/pa/songPrompt";
import { announcement, MAX_SPOKEN, scriptProblem, spokenName, spokenNumber } from "@/lib/pa/speech";
import { getServerSupabase } from "@/lib/supabase/server";

// Songs can take a while to compose.
export const maxDuration = 120;

/** Songs come back a little long so there's room to pick the best 15 seconds. */
const SONG_SECONDS = 18;
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

  const [{ data: roles }, { data: team }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("optioned_at").eq("id", teamId).maybeSingle(),
  ]);
  if (!team || !roles?.length) return errorResponse(403, "You're not on this team.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");
  const staff = roles.some((r) => ["owner", "coach", "manager"].includes(r.role));

  // Walk-ups: the kid must be on this team, and a parent must be linked to them.
  let player: { name: string; jersey_number: number | null } | null = null;
  if (kind !== "sound") {
    const playerId = str(body?.playerId, 40);
    const [{ data: p }, { data: link }] = await Promise.all([
      supabase
        .from("player")
        .select("name, jersey_number")
        .eq("id", playerId)
        .eq("team_id", teamId)
        .maybeSingle(),
      supabase
        .from("player_guardian")
        .select("id")
        .eq("player_id", playerId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (!p) return errorResponse(404, "That player isn't on this team.");
    if (!staff && !link) {
      return errorResponse(403, "Parents can only make walk-ups for their own kids.");
    }
    player = p;
  } else if (!staff) {
    return errorResponse(403, "Only coaches and managers add soundboard sounds.");
  }

  const { data: usage, error: usageError } = await supabase
    .rpc("pa_usage", { p_team_id: teamId, p_kind: kind })
    .single<{ mine: number; team: number }>();
  if (usageError || !usage) return errorResponse(500, "Couldn't check today's limit. Try again.");
  const tooMany = limitProblem(kind, usage);
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
      const { prompt, instrumental } = songPrompt({
        style: body.style,
        vibe: str(body?.vibe, MAX_VIBE),
        hook,
      });
      audio = await makeSong(prompt, instrumental, SONG_SECONDS);
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
