// Tournaments, server side: reading a screenshot of an event with Claude. Coaches add
// tournaments from screenshots (event sites tend to block servers from reading their pages).
// Never import from client code.
import Anthropic from "@anthropic-ai/sdk";
import { EVENT_JSON_SCHEMA, cleanEvent, type EventDetails } from "./event";
import { SCHEDULE_JSON_SCHEMA, cleanSchedule, type Schedule } from "./schedule";

export class EventReadError extends Error {}

export type ScreenshotImage = {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

const EVENT_PROMPT = `You read screenshots of youth baseball tournament pages (event headers, team lists) and pull out the event's details and every team in each division (age group). Several screenshots are parts of the same event: combine them, listing each team once. Divisions are age groups (e.g. "8u", "14U"); a class or level shown under an age group (e.g. "AA", "Major") is not its own division: put it in each team's class_label with the age (e.g. "8u AA"). Use the age group names as shown. Give each team's name exactly as shown and its hometown if shown. List only teams actually shown; don't guess. Dates are YYYY-MM-DD. If the picture isn't of a tournament, set is_event to false. Put anything unclear (teams hidden behind a login, divisions without teams yet) in warnings.`;

const SCHEDULE_PROMPT = `You read screenshots of a youth baseball tournament's pool play schedule and bracket and list every game. Several screenshots are parts of the same schedule: combine them, listing each game once. For each game give its game number if shown, whether it's pool play or bracket, the pool (just the letter or name, e.g. "A"), the bracket round if shown, the date (YYYY-MM-DD; use the tournament's dates when the screenshot shows only a weekday), the start time (24-hour HH:MM), the park or complex (venue) and the field within it, and the two sides. Write team names exactly as shown. Bracket games whose teams aren't known yet keep their placeholders as shown (e.g. "1st Pool A", "Winner Game 7", "Seed 3"). Only list games for the division asked about when the schedule shows several divisions. Don't guess anything that isn't shown; put anything unclear in warnings.`;

/** One read of screenshots with structured output (streamed: schedules can be long). */
async function readScreenshots(
  images: ScreenshotImage[],
  system: string,
  schema: Record<string, unknown>,
  context: string,
  maxTokens: number,
): Promise<unknown> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.data },
  }));
  const response = await client.beta.messages
    .stream({
      model: "claude-opus-5-5",
      max_tokens: maxTokens,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: [...content, { type: "text", text: context }] }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") {
    throw new EventReadError("Those screenshots couldn't be read.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new EventReadError("That's too much to read at once. Try fewer screenshots.");
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new EventReadError("Nothing came back. Try again.");
  return JSON.parse(block.text);
}

/** Read one or more screenshots of an event with Claude (together, as one event). */
export async function readEvent(images: ScreenshotImage[], context: string): Promise<EventDetails> {
  return cleanEvent(await readScreenshots(images, EVENT_PROMPT, EVENT_JSON_SCHEMA, context, 16000));
}

/** Read screenshots of the pool schedule and bracket (together, as one schedule). */
export async function readSchedule(images: ScreenshotImage[], context: string): Promise<Schedule> {
  return cleanSchedule(
    await readScreenshots(images, SCHEDULE_PROMPT, SCHEDULE_JSON_SCHEMA, context, 32000),
  );
}
