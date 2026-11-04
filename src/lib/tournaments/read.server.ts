// Tournaments, server side: reading a screenshot of an event with Claude. Coaches add
// tournaments from screenshots (event sites tend to block servers from reading their pages).
// Never import from client code.
import Anthropic from "@anthropic-ai/sdk";
import { EVENT_JSON_SCHEMA, cleanEvent, type EventDetails } from "./event";

export class EventReadError extends Error {}

const SYSTEM_PROMPT = `You read screenshots of youth baseball tournament pages (event headers, team lists). Several screenshots are parts of the same event: combine them, listing each team once and pull out the event's details and every team in each division (age group). Divisions are age groups (e.g. "8u", "14U"); a class or level shown under an age group (e.g. "AA", "Major") is not its own division: put it in each team's class_label with the age (e.g. "8u AA"). Use the age group names as shown. Give each team's name exactly as shown, its hometown if shown, and its class or level if shown (e.g. "14u AAA", "Major"). List only teams actually shown; don't guess. Dates are YYYY-MM-DD. If the picture isn't of a tournament, set is_event to false. Put anything unclear (teams hidden behind a login, divisions without teams yet) in warnings.`;

/** Read one or more screenshots of an event with Claude (together, as one event). */
export async function readEvent(
  images: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }[],
  context: string,
): Promise<EventDetails> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.data },
  }));
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // If the request is declined, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: { type: "json_schema", schema: EVENT_JSON_SCHEMA } },
    messages: [{ role: "user", content: [...content, { type: "text", text: context }] }],
  });
  if (response.stop_reason === "refusal")
    throw new EventReadError("Those screenshots couldn't be read.");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new EventReadError("Nothing came back. Try again.");
  return cleanEvent(JSON.parse(block.text));
}
