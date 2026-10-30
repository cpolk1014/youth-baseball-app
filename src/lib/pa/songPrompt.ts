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

export interface SongRequest {
  style: SongStyle;
  /** Extra description in the family's words ("dramatic intro, then it explodes"). */
  vibe?: string;
  /** Sung/chanted hook with the player's name, e.g. "Jake Polk! Six seven!" */
  hook?: string | null;
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
  const hook = req.hook ? clean(req.hook, 100) : "";
  if (hook) {
    parts.push(
      `The only vocals are a hype chant of this exact line, shouted once or twice: "${hook}". No other lyrics.`,
    );
  } else {
    parts.push("Instrumental, no vocals.");
  }
  return { prompt: parts.join(" "), instrumental: !hook };
}
