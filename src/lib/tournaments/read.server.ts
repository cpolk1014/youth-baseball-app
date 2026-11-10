// Tournaments, server side: reading a screenshot of an event with Claude. Coaches add
// tournaments from screenshots (event sites tend to block servers from reading their pages).
// Never import from client code.
import Anthropic from "@anthropic-ai/sdk";
import { EVENT_JSON_SCHEMA, cleanEvent, type EventDetails } from "./event";
import {
  SCHEDULE_JSON_SCHEMA,
  SCORES_JSON_SCHEMA,
  cleanSchedule,
  cleanScores,
  type ReadScore,
  type Schedule,
} from "./schedule";
import { TIEBREAK_JSON_SCHEMA, cleanRules, type ReadRules } from "./tiebreak";
import type { GamePlace } from "@/lib/places/maps";
import { placeDetails, searchPlaces } from "@/lib/places/google";
import { VENUES_JSON_SCHEMA, cleanVenues, venueSearchText, type ReadVenue } from "./venues";

export class EventReadError extends Error {}

export type ScreenshotImage = {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

const EVENT_PROMPT = `You read screenshots of youth baseball tournament pages (event headers, team lists) and pull out the event's details and every team in each division (age group). Several screenshots are parts of the same event: combine them, listing each team once. Divisions are age groups (e.g. "8u", "14U"); a class or level shown under an age group (e.g. "AA", "Major") is not its own division: put it in each team's class_label with the age (e.g. "8u AA"). Use the age group names as shown. Give each team's name exactly as shown and its hometown if shown. List only teams actually shown; don't guess. Dates are YYYY-MM-DD. If the picture isn't of a tournament, set is_event to false. Put anything unclear (teams hidden behind a login, divisions without teams yet) in warnings.`;

const SCHEDULE_PROMPT = `You read screenshots of a youth baseball tournament's pool play schedule and bracket and list every game. Several screenshots are parts of the same schedule: combine them, listing each game once. For each game give its game number if shown, whether it's pool play or bracket, the pool (just the letter or name, e.g. "A"), the bracket round if shown, the date (YYYY-MM-DD; use the tournament's dates when the screenshot shows only a weekday), the start time (24-hour HH:MM), the park or complex (venue) and the field within it, and the two sides. Write team names exactly as shown. Bracket games whose teams aren't known yet keep their placeholders as shown (e.g. "1st Pool A", "Winner Game 7", "Seed 3"). Many brackets are drawn as lines with few words. On those, a number at the start of a line that enters the bracket is a seed: write it as "Seed 4". The number where a game's two lines join, on the right, is that game's number. A side fed by an earlier game is "Winner Game 1", using that game's number, even when no words say so. A top seed with a first-round bye goes straight into its later game. Every game in a bracket is stage "bracket", and a bracket's game numbers are separate from pool play's. A day shown only as a weekday, such as Sunday, is that weekday within the tournament's dates. Only list games for the division asked about when the schedule shows several divisions. Don't guess anything that isn't shown; put anything unclear in warnings.`;

const TIEBREAK_PROMPT = `You read screenshots of a youth baseball tournament organization's rules and pull out how pool play standings and bracket seeding are decided, as an ordered list of tie-breakers for teams with the same record. Use only these criteria: head_to_head (results among the tied teams), runs_allowed (fewest total), run_diff (best total run differential), runs_scored (most total), runs_allowed_avg, run_diff_avg, runs_scored_avg (per game, when the rules say per game or average), coin_flip. When a rule caps runs per game (e.g. "max 8 runs per game" or a run rule margin used for differential), put that number in cap. Keep each rule's own words in text. Leave out rules that aren't tie-breakers. If a tie-breaker doesn't fit any criterion, use the closest one and say so in warnings. Set restart to true unless the rules say tied teams continue down the list after a team is separated.`;

const SCORES_PROMPT = `You read screenshots of a youth baseball tournament's results (a schedule with scores, a bracket with scores, or a results list) and list every game that shows a final score. For each give its game number if shown, the date if shown (YYYY-MM-DD), the two teams exactly as shown (the first-listed team as home), and each team's runs. Skip games without a score. Standings tables show only records, not games: list nothing from them and say so in warnings. Don't guess anything that isn't shown.`;

const VENUES_PROMPT = `You read pictures about a youth baseball tournament (a flyer, an event page, a directions page, a map, a park sign) and list the ballparks or sports complexes where its games are played. For each give its name as shown, its street address if shown, and its city and state if shown. List each park once, not each field inside it. Leave out hotels, restaurants, sponsors, registration or mailing addresses, and team hometowns. Don't guess anything that isn't shown. If no ballpark is shown, return no venues and say why in warnings.`;

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

/** Read screenshots of an organization's tie-break rules. */
export async function readTiebreak(images: ScreenshotImage[], context: string): Promise<ReadRules> {
  return cleanRules(
    await readScreenshots(images, TIEBREAK_PROMPT, TIEBREAK_JSON_SCHEMA, context, 8000),
  );
}

/** Read final scores from screenshots of the tournament's results. */
export async function readScores(
  images: ScreenshotImage[],
  context: string,
): Promise<{ games: ReadScore[]; warnings: string[] }> {
  return cleanScores(
    await readScreenshots(images, SCORES_PROMPT, SCORES_JSON_SCHEMA, context, 16000),
  );
}

/** Read the parks shown in pictures of a tournament. */
export async function readVenues(
  images: ScreenshotImage[],
  context: string,
): Promise<{ venues: ReadVenue[]; warnings: string[] }> {
  return cleanVenues(
    await readScreenshots(images, VENUES_PROMPT, VENUES_JSON_SCHEMA, context, 4000),
  );
}

/** Find a park read from a picture on the map; without a match it keeps what the picture said. */
async function findOnMap(v: ReadVenue, tournamentCity: string | null): Promise<GamePlace> {
  const asRead: GamePlace = {
    name: v.name,
    address: v.address ?? v.city,
    lat: null,
    lng: null,
    placeId: null,
  };
  try {
    const session = crypto.randomUUID();
    const [hit] = await searchPlaces(venueSearchText(v, tournamentCity), session);
    if (!hit) return asRead;
    const d = await placeDetails(hit.placeId, session);
    return {
      name: hit.name.slice(0, 80),
      address: d.address ?? (hit.detail || asRead.address),
      lat: d.lat,
      lng: d.lng,
      placeId: d.placeId,
    };
  } catch (e) {
    console.error("couldn't find a park on the map", e);
    return asRead;
  }
}

/** Each park read from a picture, looked up on the map for its address and position. */
export function findVenuesOnMap(
  venues: ReadVenue[],
  tournamentCity: string | null,
): Promise<GamePlace[]> {
  return Promise.all(venues.map((v) => findOnMap(v, tournamentCity)));
}
