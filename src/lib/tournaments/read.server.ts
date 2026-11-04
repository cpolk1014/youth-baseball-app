// Tournaments, server side: fetching an event's pages safely, reading them (or a screenshot)
// with Claude, and the weekly check for new teams. Never import from client code.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  EVENT_JSON_SCHEMA,
  cleanEvent,
  eventPages,
  htmlToText,
  isPrivateAddress,
  newTeams,
  pickDivision,
  safeEventUrl,
  teamKey,
  type EventDetails,
} from "./event";

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "RallyCap/1.0 (+https://www.rallycap.team; tournament team list check)";

export class EventReadError extends Error {}

export const BLOCKED =
  "That site doesn't let RallyCap read its pages. Take a screenshot of the team list and use it instead.";

/** Fetch one page, refusing private hosts at every redirect, with size and time limits. */
async function fetchPage(start: string): Promise<string> {
  let href = start;
  for (let hop = 0; hop < 4; hop++) {
    const url = safeEventUrl(href);
    if (!url) throw new EventReadError("That link can't be read. Use an https link to the event.");
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new EventReadError("That link can't be read.");
    }
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      href = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if ([401, 403, 429, 503].includes(res.status)) {
      // Usually bot protection (Cloudflare and the like) refusing servers; we don't get around it.
      throw new EventReadError(BLOCKED);
    }
    if (!res.ok) throw new EventReadError(`The event page answered ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(type)) {
      throw new EventReadError("That link isn't a web page.");
    }
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new EventReadError("That page is too big to read.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new EventReadError("That link redirects too many times.");
}

/** The event's readable text (its page and /teams page) and a fingerprint of it. */
export async function fetchEventText(
  link: string,
): Promise<{ url: string; text: string; hash: string }> {
  const url = safeEventUrl(link);
  if (!url) throw new EventReadError("Paste an https link to the event page.");
  const parts: string[] = [];
  for (const page of eventPages(url)) {
    try {
      parts.push(`Page ${page}:\n${htmlToText(await fetchPage(page))}`);
    } catch (e) {
      // The /teams page is a bonus; the link itself must work.
      if (parts.length === 0 && page === eventPages(url)[0]) throw e;
    }
  }
  const text = parts.join("\n\n");
  return { url: url.toString(), text, hash: createHash("sha256").update(text).digest("hex") };
}

const SYSTEM_PROMPT = `You read youth baseball tournament pages and screenshots (team lists, event pages) and pull out the event's details and every team in each division (age group). Use the division names as shown (e.g. "14u", "12U AA"). Give each team's name exactly as shown, its hometown if shown, and its class or level if shown (e.g. "14u AAA", "Major"). List only teams actually shown; don't guess. Dates are YYYY-MM-DD. If the page isn't a tournament page, set is_event to false. Put anything unclear (teams hidden behind a login, divisions without teams yet) in warnings.`;

/** Read an event's text or a screenshot of it with Claude. */
export async function readEvent(
  source:
    | { text: string }
    | {
        image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };
      },
  context: string,
): Promise<EventDetails> {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    "text" in source
      ? [{ type: "text", text: source.text }]
      : [
          {
            type: "image",
            source: { type: "base64", media_type: source.image.mediaType, data: source.image.data },
          },
        ];
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
  if (response.stop_reason === "refusal") throw new EventReadError("That page couldn't be read.");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new EventReadError("Nothing came back. Try again.");
  return cleanEvent(JSON.parse(block.text));
}

export interface CheckResult {
  added: string[];
  note: string;
}

interface TournamentRow {
  id: string;
  url: string | null;
  division: string | null;
  page_hash: string | null;
  team_id: string;
}

/**
 * Re-read a tournament's link and add teams that joined its division since. Skips Claude when
 * the page hasn't changed. Works with the signed-in coach's client or the admin client.
 */
export async function checkTournament(
  supabase: SupabaseClient,
  t: TournamentRow,
  ageGroup: string | null,
): Promise<CheckResult> {
  const now = new Date().toISOString();
  if (!t.url) return { added: [], note: "No link to check." };
  let note: string;
  let added: string[] = [];
  let hash = t.page_hash;
  try {
    const page = await fetchEventText(t.url);
    hash = page.hash;
    if (page.hash === t.page_hash) {
      note = "No changes on the event page.";
    } else {
      const event = await readEvent({ text: page.text }, "List every division and its teams.");
      const division =
        event.divisions.find((d) => teamKey(d.name) === teamKey(t.division ?? "")) ??
        event.divisions.find(
          (d) => d.name === pickDivision(event.divisions, t.division ?? ageGroup),
        );
      if (!division) {
        note = `Couldn't find the ${t.division ?? "team's"} division on the page.`;
      } else {
        const { data: existing } = await supabase
          .from("tournament_team")
          .select("name")
          .eq("tournament_id", t.id);
        const fresh = newTeams((existing ?? []) as { name: string }[], division.teams);
        if (fresh.length) {
          const { error } = await supabase.from("tournament_team").insert(
            fresh.map((x) => ({
              tournament_id: t.id,
              name: x.name,
              hometown: x.hometown,
              class_label: x.classLabel,
              source: "weekly",
            })),
          );
          if (error) throw new Error(error.message);
        }
        added = fresh.map((x) => x.name);
        note = fresh.length
          ? `${fresh.length} team${fresh.length === 1 ? "" : "s"} added: ${added.join(", ")}`.slice(
              0,
              200,
            )
          : "No new teams.";
      }
    }
  } catch (e) {
    note = e instanceof EventReadError ? e.message : "Couldn't check the event page this time.";
    if (!(e instanceof EventReadError)) console.error("tournament check failed", t.id, e);
  }
  await supabase
    .from("tournament")
    .update({ checked_at: now, page_hash: hash, check_note: note.slice(0, 200) })
    .eq("id", t.id);
  return { added, note };
}
