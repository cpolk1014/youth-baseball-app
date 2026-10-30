// Claude writes walk-up lyrics from a theme the family picks. Structured output; the
// server cleans every line before the app shows it, and a coach hears the song before it
// plays at a game.
import { lyricLines, MAX_LYRIC_LINE, MAX_LYRIC_LINES, MAX_VIBE } from "./songPrompt";

export const LYRIC_THEMES = [
  {
    id: "hype",
    label: "Pure hype",
    icon: "🔥",
    idea: "pure hype: here they come, the crowd gets loud",
  },
  {
    id: "power",
    label: "Home run power",
    icon: "💣",
    idea: "big power: crushing the ball over the fence",
  },
  {
    id: "speed",
    label: "Speed",
    icon: "⚡",
    idea: "speed: flying around the bases, stealing bags",
  },
  {
    id: "clutch",
    label: "Clutch",
    icon: "🎯",
    idea: "clutch: comes through when the game is on the line",
  },
  { id: "ace", label: "Pitcher", icon: "⚾", idea: "a lights-out pitcher: strikeouts and heat" },
  { id: "glove", label: "Defense", icon: "🧤", idea: "great defense: nothing gets by them" },
  {
    id: "funny",
    label: "Funny",
    icon: "😂",
    idea: "silly and playful, something that makes the dugout laugh",
  },
  {
    id: "team",
    label: "Team pride",
    icon: "🏆",
    idea: "team pride: playing for the team and the town",
  },
] as const;

export type LyricTheme = (typeof LYRIC_THEMES)[number]["id"];

export function isLyricTheme(t: unknown): t is LyricTheme {
  return LYRIC_THEMES.some((x) => x.id === t);
}

export const LYRICS_SYSTEM_PROMPT = `You write short walk-up song lyrics for kids on youth baseball teams (ages about 6 to 14). A walk-up song plays for a few seconds as the kid walks to the plate; the words get chanted or rapped over a beat.

Write exactly 3 different options. Each option is ${MAX_LYRIC_LINES - 1} or ${MAX_LYRIC_LINES} short lines, each 3 to 8 words and under ${MAX_LYRIC_LINE} characters, punchy and easy to chant on the beat, ideally rhyming. Give each a 1 to 3 word title.

Rules:
- Clean and kid-friendly: no swearing or near-swearing, nothing romantic, no violence or weapons, no put-downs of the other team beyond friendly trash talk ("pitcher, here it comes"), nothing about other kids by name.
- Original words only. Never quote or closely copy real song lyrics, and don't name real artists, songs, brands or pro players.
- Only use the name, number and team you're given. Use the kid's first name or the name exactly as given, at most once per option. Don't add a last name, school, town or other personal details.
- If the song already chants the name and number first (you'll be told), don't repeat that line; follow it.
- Match the theme and style. If the family's idea is unsafe or asks for real lyrics, ignore that part and write a clean original take on the theme.`;

export interface LyricsInput {
  theme: LyricTheme;
  styleLabel: string;
  /** How the name is said (e.g. "Jake"). */
  name: string;
  number: string | null;
  teamName: string;
  ageGroup: string;
  /** Whether the song chants "Name! Number ...!" before these lines. */
  hookFirst: boolean;
  idea?: string;
}

const clean = (s: string, max: number) =>
  s
    .replace(/[\r\n"“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** What Claude is told about this kid and what the family wants. */
export function lyricsRequest(input: LyricsInput): string {
  const theme = LYRIC_THEMES.find((t) => t.id === input.theme) ?? LYRIC_THEMES[0];
  const idea = clean(input.idea ?? "", MAX_VIBE);
  return [
    `Player: ${clean(input.name, 60)}${input.number ? `, number ${clean(input.number, 30)}` : ""}.`,
    `Team: ${clean(input.teamName, 60)} (${clean(input.ageGroup, 20) || "youth"}).`,
    `Music style: ${clean(input.styleLabel, 40)}.`,
    `Theme: ${theme.idea}.`,
    input.hookFirst
      ? "The song chants the player's name and number first, then sings your lines."
      : "Your lines are the only words in the song.",
    idea ? `Family's idea: ${idea}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface LyricOption {
  title: string;
  lines: string[];
}

export const lyricsSchema = {
  type: "object",
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          lines: { type: "array", items: { type: "string" } },
        },
        required: ["title", "lines"],
        additionalProperties: false,
      },
    },
  },
  required: ["options"],
  additionalProperties: false,
} as const;

/** Claude's answer, cleaned: up to 3 options, each with 2–4 short clean lines. */
export function cleanLyricOptions(raw: unknown): LyricOption[] {
  const options = (raw as { options?: unknown })?.options;
  if (!Array.isArray(options)) return [];
  return options
    .map((o: { title?: unknown; lines?: unknown }) => ({
      title: typeof o?.title === "string" ? clean(o.title, 30) : "",
      lines: Array.isArray(o?.lines)
        ? lyricLines(o.lines.filter((l): l is string => typeof l === "string").join("\n"))
        : [],
    }))
    .filter((o) => o.lines.length >= 2)
    .slice(0, 3)
    .map((o, i) => ({ ...o, title: o.title || `Option ${i + 1}` }));
}
