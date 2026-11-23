// What a push notification says. Pure: no I/O. Notifications land on lock screens, so they
// carry only what the app itself shows to the people who get them.

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping it opens (a path in the app). */
  url: string;
  /** Notifications with the same tag replace each other (one per feed, not a pile). */
  tag: string;
}

const BODY_MAX = 160;

/** A post in one line: its words, "📷 Photo", or "📊 Poll: …". */
export function postLine(post: {
  body: string;
  photos?: unknown[];
  kind?: string;
  gif?: unknown;
}): string {
  const words = post.body.replace(/\s+/g, " ").trim();
  if (post.kind === "poll") return `📊 Poll: ${words}`;
  if (post.gif) return words ? `🎞️ GIF · ${words}` : "🎞️ GIF";
  const n = post.photos?.length ?? 0;
  const photos = n ? (n === 1 ? "📷 Photo" : `📷 ${n} photos`) : "";
  return words && photos ? `${photos} · ${words}` : words || photos;
}

function clip(text: string): string {
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1).trimEnd()}…` : text;
}

/** A new post (or a club's post) in a team's Chatter. */
export function chatterPush(input: {
  teamId: string;
  teamName: string;
  from: string;
  post: { body: string; photos?: unknown[]; kind?: string };
}): PushPayload {
  return {
    title: input.teamName,
    body: clip(`${input.from}: ${postLine(input.post)}`),
    url: `/chatter?team=${input.teamId}`,
    tag: `chatter-${input.teamId}`,
  };
}

/** A new post in a club's Coach Chatter. */
export function coachPush(input: {
  clubId: string;
  clubName: string;
  from: string;
  post: { body: string; photos?: unknown[] };
}): PushPayload {
  return {
    title: `Coach Chatter · ${input.clubName}`,
    body: clip(`${input.from}: ${postLine(input.post)}`),
    url: `/coach-chatter?club=${input.clubId}`,
    tag: `coach-${input.clubId}`,
  };
}

/** The VAPID public key as the bytes the browser's subscribe() wants. */
export function keyBytes(base64url: string): Uint8Array {
  const padded = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// ── Team notices (game changes, new charges), sent in groups once changes settle ──

export interface GameEvent {
  change: "added" | "changed" | "removed";
  ref: string;
  date?: string | null;
  time?: string | null;
  opponent?: string | null;
  where?: string | null;
  changed?: string[];
}

export interface ChargeEvent {
  change: "charge";
  ref: string;
  title?: string | null;
  cents?: number | null;
  player?: string | null;
  due?: string | null;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-22" → "Sun, Nov 22" (the date as written, no time zone shifts). */
export function dayText(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return `${WEEKDAY[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "19:00:00" → "7:00 PM". */
export function timeText(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return "";
  const h = +m[1]!;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;

function gameLine(e: GameEvent): string {
  const game = [dayText(e.date), e.opponent ? `vs ${e.opponent}` : ""].filter(Boolean).join(" ");
  if (e.change === "removed") return `Off the schedule: ${game}`;
  if (e.change === "added") {
    return `New game: ${[game, timeText(e.time), e.where].filter(Boolean).join(" · ")}`;
  }
  const changed = new Set(e.changed ?? []);
  const now = [
    changed.has("date") ? `now ${dayText(e.date)}` : "",
    changed.has("time") ? `now ${timeText(e.time) || "no set time"}` : "",
    changed.has("where") && e.where ? `now at ${e.where}` : "",
    changed.has("opponent") && e.opponent ? `now vs ${e.opponent}` : "",
  ].filter(Boolean);
  return `Game update: ${game}${now.length ? ` · ${now.join(", ")}` : ""}`;
}

function gameShort(e: GameEvent): string {
  const day = dayText(e.date).split(",")[0];
  const what = e.change === "added" ? "new" : e.change === "removed" ? "off" : "changed";
  return `${day} vs ${e.opponent ?? "?"} (${what})`;
}

/** One notice for a team's game changes: the change itself, or a short list. */
export function gamesPush(teamId: string, teamName: string, events: GameEvent[]): PushPayload {
  const one = events.length === 1 ? events[0]! : null;
  return {
    title: teamName,
    body: clip(
      one
        ? gameLine(one)
        : `${events.length} schedule changes: ${events.map(gameShort).join(", ")}`,
    ),
    url: one && one.change !== "removed" ? `/games/${one.ref}` : "/games",
    tag: `games-${teamId}`,
  };
}

/** One notice for a family's new charges. */
export function chargesPush(teamId: string, teamName: string, events: ChargeEvent[]): PushPayload {
  const one = events.length === 1 ? events[0]! : null;
  const players = [...new Set(events.map((e) => e.player).filter(Boolean))].join(" & ");
  const due = one?.due ? `, due ${dayText(one.due).split(", ")[1]}` : "";
  return {
    title: teamName,
    body: clip(
      one
        ? `New charge${players ? ` for ${players}` : ""}: ${one.title ?? "Team charge"} · ${money(one.cents)}${due}`
        : `${events.length} new charges${players ? ` for ${players}` : ""}: ${events
            .map((e) => `${e.title ?? "Charge"} (${money(e.cents)})`)
            .join(", ")}`,
    ),
    url: "/money",
    tag: `money-${teamId}`,
  };
}

/** A kid's line from a coach's box score, for one of their parents. */
export interface BoxScoreEvent {
  change: "boxscore";
  ref: string;
  player_id?: string | null;
  /** The kid's first name. */
  player?: string | null;
  date?: string | null;
  opponent?: string | null;
  batting?: Record<string, number | null | undefined> | null;
  pitching?: Record<string, number | null | undefined> | null;
  /** This parent has a Player pass covering the kid (else the notice only teases). */
  unlocked?: boolean | null;
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** "2 for 3 with a double and 2 RBI", "drew 2 walks", or "" with no at-bats or walks. */
function battingPhrase(b: BoxScoreEvent["batting"]): string {
  const n = (k: string) => Math.max(0, Math.round(Number(b?.[k] ?? 0)) || 0);
  const ab = n("ab");
  const bb = n("bb");
  if (ab === 0) return bb > 0 ? `drew ${count(bb, "a walk", "walks")}` : "";
  const extras = [
    n("hr") ? count(n("hr"), "a homer", "homers") : "",
    n("triples") ? count(n("triples"), "a triple", "triples") : "",
    n("doubles") ? count(n("doubles"), "a double", "doubles") : "",
    n("rbi") ? (n("rbi") === 1 ? "an RBI" : `${n("rbi")} RBI`) : "",
    n("bb") ? count(bb, "a walk", "walks") : "",
    n("sb") ? count(n("sb"), "a stolen base", "stolen bases") : "",
  ]
    .filter(Boolean)
    .slice(0, 3);
  const with_ =
    extras.length === 0
      ? ""
      : ` with ${extras.length === 1 ? extras[0] : `${extras.slice(0, -1).join(", ")} and ${extras.at(-1)}`}`;
  return `went ${n("h")} for ${ab}${with_}`;
}

/** Innings from outs: 6 → "2 innings", 4 → "1⅓ innings", 2 → "⅔ of an inning". */
export function inningsText(outs: number): string {
  const whole = Math.floor(outs / 3);
  const third = ["", "⅓", "⅔"][outs % 3];
  if (whole === 0) return `${third} of an inning`;
  return `${whole}${third} ${whole === 1 && !third ? "inning" : "innings"}`;
}

/** "pitched 2 innings (34 pitches, 5 strikeouts)", or "threw 34 pitches" with only a count. */
function pitchingPhrase(p: BoxScoreEvent["pitching"]): string {
  if (!p) return "";
  const n = (k: string) => Math.max(0, Math.round(Number(p[k] ?? 0)) || 0);
  const pitches = n("pitches");
  if (n("outs") === 0) return pitches > 0 ? `threw ${pitches} pitches` : "";
  const extras = [
    pitches ? `${pitches} pitches` : "",
    n("so") ? count(n("so"), "1 strikeout", "strikeouts") : "",
  ].filter(Boolean);
  return `pitched ${inningsText(n("outs"))}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}

/** One kid's line in a sentence: "Mason went 2 for 3 with a double vs Cubs." */
export function boxScoreLine(e: BoxScoreEvent): string {
  const name = e.player?.trim() || "Your player";
  const vs = e.opponent && e.opponent !== "x" ? ` vs ${e.opponent}` : "";
  const parts = [battingPhrase(e.batting), pitchingPhrase(e.pitching)].filter(Boolean);
  if (!parts.length) return `${name}'s line${vs} is in.`;
  return `${name} ${parts.join(" and ")}${vs}.`;
}

/**
 * A parent's notice when the coach adds a box score: each of their kids' lines, or, without
 * a Player pass, that the box score is in (no numbers: the stats are what the pass buys).
 */
export function boxScorePush(
  teamId: string,
  teamName: string,
  events: BoxScoreEvent[],
): PushPayload {
  const players = [...new Set(events.map((e) => e.player_id).filter(Boolean))];
  const open = events.filter((e) => e.unlocked);
  const locked = events.filter((e) => !e.unlocked);
  const lockedNames = [...new Set(locked.map((e) => e.player?.trim() || "your player"))];
  const first = locked[0];
  const vs = first?.opponent && first.opponent !== "x" ? ` vs ${first.opponent}` : "";
  const day = dayText(first?.date).split(",")[0];
  const tease = locked.length
    ? `The box score${day ? ` from ${day}` : ""}${vs} is in. See how ${
        lockedNames.length === 1
          ? lockedNames[0]
          : `${lockedNames.slice(0, -1).join(", ")} and ${lockedNames.at(-1)}`
      } did.`
    : "";
  return {
    title: teamName,
    body: clip([...open.map(boxScoreLine), tease].filter(Boolean).join(" ")),
    url: players.length === 1 ? `/my-player?player=${players[0]}` : "/my-player",
    tag: `stats-${teamId}`,
  };
}
