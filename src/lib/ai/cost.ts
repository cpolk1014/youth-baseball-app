// What an AI call really cost, in cents, for the team's season AI budget. Pure.
// Prices checked November 2026 (per million tokens; thinking counts as output).

const CLAUDE: Record<string, { input: number; output: number }> = {
  opus: { input: 4, output: 20 },
  sonnet: { input: 2, output: 10 },
  haiku: { input: 0.1, output: 0.5 },
};

export interface ClaudeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Cents for one Claude response (unknown models are priced like Opus, the dearest). */
export function claudeCents(model: string, usage: ClaudeUsage | null | undefined): number {
  const family = Object.keys(CLAUDE).find((f) => model.includes(f)) ?? "opus";
  const price = CLAUDE[family]!;
  const input =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage?.cache_read_input_tokens ?? 0) * 0.1;
  const dollars = (input * price.input + (usage?.output_tokens ?? 0) * price.output) / 1_000_000;
  return Math.round(dollars * 100 * 1000) / 1000;
}

/** ElevenLabs: music at $0.15 a minute, speech at $0.08 per 1,000 characters, effects ~3.3¢. */
export const elevenCents = {
  song: (seconds: number) => Math.max(0, seconds) * 0.25,
  speech: (characters: number) => Math.max(0, characters) * 0.008,
  sound: () => 3.3,
};
