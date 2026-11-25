// Which ElevenLabs voice the announcer uses, and how it's asked to speak. Pure, so it can
// be tested; `elevenlabs.ts` (server only) reads the env and sends the request.

/** ElevenLabs' standard "George": used only when no announcer voice is set. */
export const DEFAULT_ANNOUNCER_VOICE = "JBFqnCBsd6RMkjVDRZzb";

/** ElevenLabs voice ids are 20 letters and digits. */
const VOICE_ID = /^[A-Za-z0-9]{20}$/;

export interface AnnouncerVoice {
  id: string;
  /** Why the default is used, when it is (for the server log). */
  fallback: "missing" | "malformed" | null;
}

/**
 * The announcer's voice from ELEVENLABS_ANNOUNCER_VOICE_ID. Pasted values often carry
 * spaces, a line break or quotes ("abc…" or 'abc…'); those are cleaned off rather than
 * sent to ElevenLabs.
 */
export function announcerVoice(raw: string | undefined): AnnouncerVoice {
  const id = (raw ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!id) return { id: DEFAULT_ANNOUNCER_VOICE, fallback: "missing" };
  if (!VOICE_ID.test(id)) return { id: DEFAULT_ANNOUNCER_VOICE, fallback: "malformed" };
  return { id, fallback: null };
}

/**
 * How the announcer speaks. Stability at 0.5 or above keeps every call sounding like the
 * chosen voice: lower stability plus a strong style setting made some calls drift into a
 * different, generic-sounding voice, most on short lines like "Now batting… Jake Polk!".
 */
export const ANNOUNCER_MODEL = "eleven_multilingual_v2";
export const ANNOUNCER_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.9,
  style: 0.2,
  use_speaker_boost: true,
  speed: 0.9,
} as const;
