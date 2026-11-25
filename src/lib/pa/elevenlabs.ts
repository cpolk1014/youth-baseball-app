// ElevenLabs calls (server only): songs, the announcer's voice and sound effects.
// Each returns MP3 bytes. The key never reaches the browser.

import { ANNOUNCER_MODEL, ANNOUNCER_SETTINGS, announcerVoice } from "./voice";

const API = "https://api.elevenlabs.io/v1";

export class AudioMakerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call(path: string, body: unknown): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key)
    throw new AudioMakerError(503, "AI sound isn't set up yet (missing ELEVENLABS_API_KEY).");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (res.ok) return await res.arrayBuffer();
  const detail = await res.text().catch(() => "");
  console.error(`ElevenLabs ${path} failed: ${res.status} ${detail.slice(0, 500)}`);
  if (res.status === 401 || res.status === 403) {
    throw new AudioMakerError(
      503,
      "AI sound isn't working right now (account problem). Tell your coach.",
    );
  }
  if (res.status === 400 || res.status === 422) {
    // Most often a prompt the music model won't make (e.g. naming a real artist or song).
    throw new AudioMakerError(
      422,
      "The AI couldn't make that one. Describe the sound instead of naming a real song or artist, and try again.",
    );
  }
  if (res.status === 429) throw new AudioMakerError(429, "The AI is busy. Try again in a minute.");
  throw new AudioMakerError(502, "The AI couldn't make it this time. Try again.");
}

/** A song from a request body built by `songRequest` (a prompt, or a composition plan). */
export function makeSong(body: Record<string, unknown>) {
  return call("/music?output_format=mp3_44100_128", body);
}

/** The announcer reading `text`: walk-up calls and Pine Tar highlight calls both come here,
 * in the voice set by ELEVENLABS_ANNOUNCER_VOICE_ID. */
export function makeAnnouncement(text: string) {
  const voice = announcerVoice(process.env.ELEVENLABS_ANNOUNCER_VOICE_ID);
  if (voice.fallback) {
    console.error(
      `ELEVENLABS_ANNOUNCER_VOICE_ID is ${voice.fallback}; the announcer is using ElevenLabs' default voice.`,
    );
  }
  return call(`/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
    text,
    model_id: ANNOUNCER_MODEL,
    voice_settings: ANNOUNCER_SETTINGS,
  });
}

export function makeSoundEffect(text: string, seconds: number) {
  return call("/sound-generation?output_format=mp3_44100_128", {
    text,
    duration_seconds: seconds,
    prompt_influence: 0.5,
  });
}
