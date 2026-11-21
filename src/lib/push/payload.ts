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
export function postLine(post: { body: string; photos?: unknown[]; kind?: string }): string {
  const words = post.body.replace(/\s+/g, " ").trim();
  if (post.kind === "poll") return `📊 Poll: ${words}`;
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
