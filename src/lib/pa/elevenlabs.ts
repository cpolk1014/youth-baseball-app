// ElevenLabs calls (server only): songs, the announcer's voice and sound effects.
// Each returns MP3 bytes. The key never reaches the browser.

const API = "https://api.elevenlabs.io/v1";
/** A deep, clear voice from ElevenLabs' standard set; swap in a stadium-announcer voice
 * from the Voice Library with ELEVENLABS_ANNOUNCER_VOICE_ID. */
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

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

export function makeAnnouncement(text: string) {
  const voice = process.env.ELEVENLABS_ANNOUNCER_VOICE_ID || DEFAULT_VOICE;
  return call(`/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.55, speed: 0.9 },
  });
}

export function makeSoundEffect(text: string, seconds: number) {
  return call("/sound-generation?output_format=mp3_44100_128", {
    text,
    duration_seconds: seconds,
    prompt_influence: 0.5,
  });
}
