// Turning a family's pick into a prompt for the AI song maker (ElevenLabs Music).
// The server builds the prompt; families only choose a style, describe a vibe and decide
// whether the kid's name is in the song.

export const SONG_STYLES = [
  {
    id: "rock",
    label: "Stadium rock",
    prompt: "stadium rock anthem with huge drums and crunchy electric guitar riffs",
  },
  {
    id: "hiphop",
    label: "Hip-hop hype",
    prompt: "hard-hitting hip-hop beat with heavy 808 bass and crowd claps",
  },
  { id: "edm", label: "EDM drop", prompt: "festival EDM build-up and big bass drop" },
  { id: "pop", label: "Pop", prompt: "bright, catchy upbeat pop with a bouncy groove" },
  {
    id: "country",
    label: "Country",
    prompt: "upbeat country rock with twangy guitar and stomping drums",
  },
  { id: "latin", label: "Latin", prompt: "energetic reggaeton and Latin percussion groove" },
  {
    id: "band",
    label: "Marching band",
    prompt: "fired-up marching band with brass and booming drumline",
  },
  {
    id: "organ",
    label: "Ballpark organ",
    prompt: "classic ballpark stadium organ riff, playful and loud",
  },
] as const;

export type SongStyle = (typeof SONG_STYLES)[number]["id"];

export const MAX_VIBE = 200;
export const SONG_SECONDS = 15;
/** Words to sing: a few short lines, so they fit in a walk-up. */
export const MAX_LYRIC_LINES = 4;
export const MAX_LYRIC_LINE = 60;

export interface SongRequest {
  style: SongStyle;
  /** Extra description in the family's words ("dramatic intro, then it explodes"). */
  vibe?: string;
  /** Sung/chanted hook with the player's name, e.g. "Jake Polk! Six seven!" */
  hook?: string | null;
  /** The family's own words to sing, one line each. */
  lyrics?: string;
}

export function isSongStyle(s: unknown): s is SongStyle {
  return SONG_STYLES.some((x) => x.id === s);
}

/** Quotes and line breaks out; trimmed to length. */
function clean(text: string, max: number): string {
  return text
    .replace(/["“”\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** The family's lyrics as clean lines (blank lines dropped, capped). */
export function lyricLines(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => clean(l, MAX_LYRIC_LINE))
    .filter(Boolean)
    .slice(0, MAX_LYRIC_LINES);
}

/** The hook a kid's song chants: their name, and number if they have one. */
export function songHook(name: string, number: string | null): string {
  const n = clean(name, 60);
  const num = number ? clean(number, 30) : "";
  return num ? `${n}! Number ${num}!` : `${n}!`;
}

/** The prompt sent to the music model, and whether it should be instrumental. */
export function songPrompt(req: SongRequest): { prompt: string; instrumental: boolean } {
  const style = SONG_STYLES.find((s) => s.id === req.style) ?? SONG_STYLES[0];
  const vibe = clean(req.vibe ?? "", MAX_VIBE);
  const parts = [
    `A ${SONG_SECONDS}-second walk-up song for a youth baseball player stepping up to bat: ${style.prompt}.`,
    "High energy from the first second, kid-friendly and clean, ends on a strong hit.",
  ];
  if (vibe) parts.push(`Vibe: ${vibe}.`);
  parts.push("Instrumental, no vocals.");
  return { prompt: parts.join(" "), instrumental: true };
}

/** Section lengths for a song with words: room for the announcer, then the words. */
export const INTRO_MS = 4000;
export const VOCAL_MS = 11000;
export const OUTRO_MS = 3000;

/**
 * What to send the music model. Songs with words use a composition plan, which makes the
 * model sing exactly these lines (a plain prompt often comes back instrumental): a short
 * instrumental intro the announcer can talk over, the words, then a big finish.
 */
export function songRequest(req: SongRequest): Record<string, unknown> {
  const lines = [...(req.hook ? [clean(req.hook, 100)] : []), ...lyricLines(req.lyrics)];
  if (lines.length === 0) {
    const { prompt } = songPrompt(req);
    return {
      prompt,
      music_length_ms: INTRO_MS + VOCAL_MS + OUTRO_MS,
      model_id: "music_v1",
      force_instrumental: true,
    };
  }
  const style = SONG_STYLES.find((s) => s.id === req.style) ?? SONG_STYLES[0];
  const vibe = clean(req.vibe ?? "", MAX_VIBE);
  return {
    model_id: "music_v1",
    composition_plan: {
      positive_global_styles: [
        style.prompt,
        "walk-up song for a youth baseball player",
        "high energy",
        "kid-friendly",
        "clean lyrics",
        ...(vibe ? [vibe] : []),
      ],
      negative_global_styles: ["explicit lyrics", "slow tempo", "sad", "quiet"],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["instrumental build-up", "hype"],
          negative_local_styles: ["vocals"],
          duration_ms: INTRO_MS,
          lines: [],
        },
        {
          section_name: "Hook",
          positive_local_styles: [
            "loud confident vocals",
            "shouted hype chant",
            "crowd gang vocals",
            "every word clear",
          ],
          negative_local_styles: ["instrumental", "mumbled vocals"],
          duration_ms: VOCAL_MS,
          lines,
        },
        {
          section_name: "Outro",
          positive_local_styles: ["big final hit", "instrumental"],
          negative_local_styles: ["vocals"],
          duration_ms: OUTRO_MS,
          lines: [],
        },
      ],
    },
    respect_sections_durations: true,
  };
}
