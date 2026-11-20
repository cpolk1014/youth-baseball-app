// Chatter, the team's chat feed: who wrote a post, what someone may do with it, and how the
// feed is ordered and grouped by day. Pure: no I/O, no React. The database enforces the same
// rules (supabase/migrations/20261207000000_chatter.sql); these decide what the app shows.
import type { MemberRole } from "@/lib/data/permissions";
import type { Guardian, Member } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";

export const BODY_MAX = 2000;
/** Authors can fix a post for this long. */
export const EDIT_MINUTES = 10;

export interface ChatterPost {
  id: string;
  teamId: string;
  /** Null once the account is deleted. */
  authorId: string | null;
  body: string;
  quotePostId: string | null;
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
    createdAt: r.created_at,
    editedAt: r.edited_at,
    pinnedAt: r.pinned_at,
    removedAt: r.removed_at,
  };
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
  if (post.removedAt) return false;
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
