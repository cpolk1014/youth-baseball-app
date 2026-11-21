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
