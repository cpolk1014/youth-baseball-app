// Chatter, the team's chat feed: who wrote a post, what someone may do with it, and how the
// feed is ordered and grouped by day. Pure: no I/O, no React. The database enforces the same
// rules (supabase/migrations/20261207000000_chatter.sql); these decide what the app shows.
import type { MemberRole } from "@/lib/data/permissions";
import type { Guardian, Member } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";
import { gifFrom, type ChatterGif } from "./gif";

export const BODY_MAX = 2000;
/** Authors can fix a post for this long. */
export const EDIT_MINUTES = 10;
/** Photos per post. */
export const PHOTOS_MAX = 4;

/** A photo on a post: the full size (1600 px) and the feed's thumbnail, in chatter-photos. */
export interface ChatterPhoto {
  path: string;
  thumb: string;
  w: number;
  h: number;
}

export type ChatterChannel = "team" | "parents";

/** Someone who can post in a team's Chatter, as `chatter_people` returns them. */
export interface ChatterPerson {
  userId: string;
  name: string | null;
  /** A team role, or "director" / "club_admin" for the club's admins. */
  role: string;
  /** Their kids' first names on the team (parents). */
  kids: string[];
}

/** How a person shows on a post: their name, and their role or family. */
export function authorFromPerson(p: ChatterPerson): Author {
  const label: Record<string, string> = {
    owner: "Coach",
    coach: "Coach",
    manager: "Manager",
    treasurer: "Treasurer",
    director: "Club director",
    club_admin: "Club admin",
  };
  const family = p.kids.length ? `${joinNames(p.kids)}'s family` : null;
  const role = p.role === "parent" ? (family ?? "Parent") : (label[p.role] ?? "Parent");
  const staff = !["parent", "treasurer"].includes(p.role);
  return { name: p.name?.trim() || (p.role === "parent" ? "Parent" : role), role, staff };
}

export interface ChatterPost {
  id: string;
  teamId: string;
  /** Null once the account is deleted. */
  authorId: string | null;
  body: string;
  quotePostId: string | null;
  kind: "post" | "poll";
  photos: ChatterPhoto[];
  /** One GIF from GIPHY, or null. */
  gif: ChatterGif | null;
  /** Who it tags: user ids, or "coaches" / "everyone". */
  mentions: string[];
  reactions: Reaction[];
  /** Set on a club's post to the team: who it's from (the club, not a person). */
  club: ClubTag | null;
  /** Posted by Fungo itself (the automatic game day post). */
  fromFungo?: boolean;
  /** Stored names: 'parents' is shown as Team (the team only, never the club; a team not in a
   * club has only this one) and 'team' as Club (with the club's director and admins). */
  channel: ChatterChannel;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  removedAt: string | null;
}

export interface ChatterPostRow {
  id: string;
  team_id: string;
  author_id: string | null;
  body: string;
  quote_post_id: string | null;
  kind?: string;
  photos?: unknown;
  gif?: unknown;
  mentions?: unknown;
  reactions?: unknown;
  club?: unknown;
  from_fungo?: boolean | null;
  channel?: string | null;
  created_at: string;
  edited_at: string | null;
  pinned_at: string | null;
  removed_at: string | null;
}

export function postFromRow(r: ChatterPostRow): ChatterPost {
  return {
    id: r.id,
    teamId: r.team_id,
    authorId: r.author_id,
    body: r.body,
    quotePostId: r.quote_post_id,
    kind: r.kind === "poll" ? "poll" : "post",
    photos: photosFrom(r.photos),
    gif: gifFrom(r.gif),
    mentions: Array.isArray(r.mentions)
      ? r.mentions.filter((m): m is string => typeof m === "string")
      : [],
    reactions: reactionsFrom(r.reactions),
    club: clubFrom(r.club),
    ...(r.from_fungo ? { fromFungo: true } : {}),
    channel: r.channel === "parents" ? "parents" : "team",
    createdAt: r.created_at,
    editedAt: r.edited_at,
    pinnedAt: r.pinned_at,
    removedAt: r.removed_at,
  };
}

function photosFrom(value: unknown): ChatterPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p): ChatterPhoto[] => {
    if (!p || typeof p !== "object") return [];
    const { path, thumb, w, h } = p as Record<string, unknown>;
    if (typeof path !== "string" || typeof thumb !== "string") return [];
    return [{ path, thumb, w: typeof w === "number" ? w : 0, h: typeof h === "number" ? h : 0 }];
  });
}

/** The club a club post is from: its name, logo (team-logos path) and main color. */
export interface ClubTag {
  name: string;
  logo: string | null;
  color: string | null;
}

export function clubFrom(value: unknown): ClubTag | null {
  if (!value || typeof value !== "object") return null;
  const { name, logo, color } = value as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) return null;
  return {
    name,
    logo: typeof logo === "string" && logo ? logo : null,
    color: typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
  };
}

/** A club's initials for its badge when it has no logo: "Traction Canes" → "TC". */
export function clubInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}

// ── Reactions ──

/** One emoji on a post and who tapped it (first to tap first). */
export interface Reaction {
  emoji: string;
  userIds: string[];
}

/** Different emoji one person can put on a post (the database says the same). */
export const REACTIONS_PER_PERSON = 3;
/** The row of one-tap choices; any other emoji comes from the phone's emoji keyboard. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "⚾", "👏"] as const;

export function reactionsFrom(value: unknown): Reaction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r): Reaction[] => {
    if (!r || typeof r !== "object") return [];
    const { e, u } = r as Record<string, unknown>;
    if (typeof e !== "string" || !Array.isArray(u)) return [];
    const userIds = u.filter((id): id is string => typeof id === "string");
    return userIds.length ? [{ emoji: e, userIds }] : [];
  });
}

/** The emoji I've put on a post. */
export const myReactions = (reactions: Reaction[], userId: string): string[] =>
  reactions.filter((r) => r.userIds.includes(userId)).map((r) => r.emoji);

/** The post's reactions after I tap an emoji (on if I hadn't, off if I had), for showing it
 *  before the server answers. Unchanged when I'm already at the limit. */
export function toggleReaction(reactions: Reaction[], emoji: string, userId: string): Reaction[] {
  const had = reactions.some((r) => r.emoji === emoji && r.userIds.includes(userId));
  if (had) {
    return reactions
      .map((r) =>
        r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== userId) } : r,
      )
      .filter((r) => r.userIds.length > 0);
  }
  if (myReactions(reactions, userId).length >= REACTIONS_PER_PERSON) return reactions;
  const at = reactions.findIndex((r) => r.emoji === emoji);
  if (at < 0) return [...reactions, { emoji, userIds: [userId] }];
  return reactions.map((r, i) => (i === at ? { ...r, userIds: [...r.userIds, userId] } : r));
}

/** The single emoji someone typed or picked, or null when it isn't exactly one emoji. */
export function oneEmoji(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 16) return null;
  const parts =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].map(
          (p) => p.segment,
        )
      : [t];
  if (parts.length !== 1) return null;
  const g = parts[0]!;
  const pictographic = /\p{Extended_Pictographic}/u.test(g);
  const flag = /^\p{Regional_Indicator}{2}$/u.test(g);
  const keycap = /^[0-9#*]\uFE0F?\u20E3$/u.test(g);
  if (!pictographic && !flag && !keycap) return null;
  return /[\p{L}\s<>&"'`\\]/u.test(g) ? null : g;
}

/** "Dana, Pat and 3 others" for who tapped an emoji; "You" first when I did. */
export function reactorNames(
  userIds: string[],
  me: string,
  nameOf: (id: string) => string,
): string {
  const names = [
    ...(userIds.includes(me) ? ["You"] : []),
    ...userIds.filter((id) => id !== me).map(nameOf),
  ];
  if (names.length <= 3) return joinNames(names).replace(" & ", " and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/** What a post says in one line: its words, or its photos. */
export function previewText(
  post: Pick<ChatterPost, "body" | "photos"> & {
    kind?: ChatterPost["kind"];
    gif?: ChatterGif | null;
  },
  max = 120,
): string {
  const words = snippet(post.body, max);
  if (post.kind === "poll") return `📊 Poll: ${words}`;
  if (post.gif) return words ? `🎞️ GIF · ${words}` : "🎞️ GIF";
  const n = post.photos.length;
  const photos = n ? (n === 1 ? "📷 Photo" : `📷 ${n} photos`) : "";
  return words && photos ? `${photos} · ${words}` : words || photos;
}

/** Where a new photo goes: the poster's own folder on the team. */
export function photoPaths(teamId: string, userId: string, id: string) {
  const base = `${teamId}/${userId}/${id}`;
  return { path: `${base}.jpg`, thumb: `${base}-t.jpg` };
}

export interface Author {
  name: string;
  /** "Coach", "Manager", "Mason's family"… null for a former member. */
  role: string | null;
  staff: boolean;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Coach",
  coach: "Coach",
  manager: "Manager",
  treasurer: "Treasurer",
  parent: "Parent",
};

/** Who wrote a post, as the team knows them. */
export function authorOf(
  authorId: string | null,
  team: { members: Member[]; guardians: Guardian[]; players: Player[] },
): Author {
  const member = authorId ? team.members.find((m) => m.userId === authorId) : undefined;
  if (!member) return { name: "Former member", role: null, staff: false };
  const staff = member.role !== "parent" && member.role !== "treasurer";
  const kids = team.guardians
    .filter((g) => g.userId === member.userId)
    .map((g) => team.players.find((p) => p.id === g.playerId))
    .filter((p): p is Player => p !== undefined)
    .map((p) => firstName(p.name));
  const family = kids.length ? `${joinNames(kids)}'s family` : null;
  const role = member.role === "parent" ? (family ?? "Parent") : ROLE_LABEL[member.role];
  return { name: member.displayName?.trim() || ROLE_LABEL[member.role], role, staff };
}

const isStaffRole = (role: MemberRole) =>
  role === "owner" || role === "coach" || role === "manager";

/** Coaches and managers moderate: remove any post, pin, pause posting, see reports. */
export const canModerate = isStaffRole;

export function canEdit(post: ChatterPost, me: string | null, now = new Date()): boolean {
  if (!me || post.authorId !== me || post.removedAt) return false;
  return now.getTime() - new Date(post.createdAt).getTime() < EDIT_MINUTES * 60_000;
}

export function canRemove(post: ChatterPost, me: string | null, role: MemberRole): boolean {
  // Clubs pay: their posts stay up until the club takes them down.
  if (post.removedAt || post.club) return false;
  return (me !== null && post.authorId === me) || isStaffRole(role);
}

/** Add or replace posts (from a page load or a live update), oldest first. */
export function mergePosts(posts: ChatterPost[], incoming: ChatterPost[]): ChatterPost[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** The one pinned post, if any (removed posts are never pinned). */
export function pinnedPost(posts: ChatterPost[]): ChatterPost | null {
  return (
    posts
      .filter((p) => p.pinnedAt && !p.removedAt)
      .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!))[0] ?? null
  );
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Yesterday", "Saturday", or "Sat, Nov 14" (with the year when it isn't this one). */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  const daysAgo = (now.getTime() - d.getTime()) / 86_400_000;
  if (daysAgo > 0 && daysAgo < 6) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export interface FeedItem {
  post: ChatterPost;
  /** Set on the first post of each day. */
  day: string | null;
  /** Same author as the post just before, within 5 minutes: the name isn't repeated. */
  grouped: boolean;
}

export function feedItems(posts: ChatterPost[], now = new Date()): FeedItem[] {
  let lastDay = "";
  return posts.map((post, i) => {
    const day = dayLabel(post.createdAt, now);
    const prev = posts[i - 1];
    const newDay = day !== lastDay;
    lastDay = day;
    const grouped =
      !newDay &&
      !!prev &&
      !prev.removedAt &&
      !post.removedAt &&
      !post.quotePostId &&
      !post.club &&
      !prev.club &&
      post.authorId !== null &&
      prev.authorId === post.authorId &&
      new Date(post.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
    return { post, day: newDay ? day : null, grouped };
  });
}

/** The start of a quoted post, on one line. */
export function snippet(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export const REPORT_REASONS = [
  { id: "mean", label: "Mean or bullying" },
  { id: "inappropriate", label: "Not appropriate for a team" },
  { id: "child_safety", label: "A child's safety" },
  { id: "spam", label: "Spam or selling" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

/** How long a coach can pause someone's posting. */
export const PAUSES = [
  { label: "1 day", hours: 24 },
  { label: "1 week", hours: 24 * 7 },
] as const;

// ── Polls ──

export const POLL_OPTIONS_MAX = 10;
export const POLL_OPTION_MAX = 120;

export interface ChatterPoll {
  postId: string;
  options: string[];
  multi: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closedAt: string | null;
  version: number;
}

export interface ChatterPollRow {
  post_id: string;
  options: string[];
  multi: boolean;
  anonymous: boolean;
  closes_at: string | null;
  closed_at: string | null;
  version: number;
}

export function pollFromRow(r: ChatterPollRow): ChatterPoll {
  return {
    postId: r.post_id,
    options: r.options,
    multi: r.multi,
    anonymous: r.anonymous,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    version: r.version,
  };
}

export function pollOpen(poll: ChatterPoll, now = new Date()): boolean {
  if (poll.closedAt) return false;
  return !poll.closesAt || new Date(poll.closesAt).getTime() > now.getTime();
}

/** One choice's results. voters is null on anonymous polls. */
export interface PollChoice {
  votes: number;
  mine: boolean;
  voters: string[] | null;
}

export interface PollTally {
  choices: {
    label: string;
    votes: number;
    share: number;
    mine: boolean;
    voters: string[] | null;
    leading: boolean;
  }[];
  /** People who voted (a person picking two choices counts once, when names are known). */
  voters: number;
  votes: number;
}

/** Results ready to draw: share of votes per choice and which choice leads (ties all lead). */
export function tally(poll: ChatterPoll, results: PollChoice[] | undefined): PollTally {
  const rows = poll.options.map((_, i) => results?.[i] ?? { votes: 0, mine: false, voters: [] });
  const votes = rows.reduce((n, r) => n + r.votes, 0);
  const top = Math.max(0, ...rows.map((r) => r.votes));
  const people = poll.anonymous
    ? poll.multi
      ? null
      : votes
    : new Set(rows.flatMap((r) => r.voters ?? [])).size;
  return {
    choices: poll.options.map((label, i) => {
      const r = rows[i]!;
      return {
        label,
        votes: r.votes,
        share: votes ? r.votes / votes : 0,
        mine: r.mine,
        voters: r.voters,
        leading: top > 0 && r.votes === top,
      };
    }),
    voters: people ?? votes,
    votes,
  };
}

/** My choices after tapping one: a single-choice poll switches (or takes back), multi toggles. */
export function nextVote(poll: ChatterPoll, mine: number[], tapped: number): number[] {
  if (poll.multi) {
    return mine.includes(tapped)
      ? mine.filter((i) => i !== tapped)
      : [...mine, tapped].sort((a, b) => a - b);
  }
  return mine.length === 1 && mine[0] === tapped ? [] : [tapped];
}

/** "Closes Sat 9:00 PM", "Closed", or "" for a poll with no end. */
export function pollStatus(poll: ChatterPoll, now = new Date()): string {
  if (!pollOpen(poll, now)) return "Closed";
  if (!poll.closesAt) return "";
  const d = new Date(poll.closesAt);
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `Closes at ${time}`
    : `Closes ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

/** Clean up choices typed in the form: trimmed, blanks dropped. Returns an error to show, if any. */
export function checkPoll(question: string, options: string[]): string | null {
  const choices = options.map((o) => o.trim()).filter(Boolean);
  if (!question.trim()) return "Ask a question first.";
  if (choices.length < 2) return "A poll needs at least 2 choices.";
  if (choices.length > POLL_OPTIONS_MAX) return `Up to ${POLL_OPTIONS_MAX} choices.`;
  if (new Set(choices.map((c) => c.toLowerCase())).size < choices.length)
    return "Two of the choices are the same.";
  if (choices.some((c) => c.length > POLL_OPTION_MAX)) return "Keep each choice short.";
  return null;
}

export const POLL_ENDS = [
  { label: "No end", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
] as const;
