// Chatter, the team's chat feed: reads, writes and live updates through Supabase. The
// database decides who reads and posts (team members only) and enforces every rule.
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  postFromRow,
  type ChatterPost,
  type ChatterPostRow,
  type ReportReason,
} from "@/lib/chatter/feed";
import { getBrowserSupabase } from "@/lib/supabase/client";

const COLUMNS =
  "id, team_id, author_id, body, quote_post_id, created_at, edited_at, pinned_at, removed_at";
export const PAGE = 50;

/** Device copy of the last posts, so the feed opens in the dugout with no signal. */
export const CACHE_PREFIX = "rallycap:chatter:";

function fail(error: { message: string; code?: string } | null): void {
  if (error) throw new ChatterError(error.message, error.code);
}

export class ChatterError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
  /** The team's season isn't paid (the database's paywall code). */
  get unpaid(): boolean {
    return this.code === "P0402";
  }
}

/** The newest posts (oldest first), or the page before `before`. */
export async function loadPosts(teamId: string, before?: string): Promise<ChatterPost[]> {
  let q = getBrowserSupabase()
    .from("chatter_post")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  fail(error);
  return ((data ?? []) as ChatterPostRow[]).map(postFromRow).reverse();
}

/** The pinned post, which may be older than the loaded page. */
export async function loadPinned(teamId: string): Promise<ChatterPost | null> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_post")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .not("pinned_at", "is", null)
    .is("removed_at", null)
    .order("pinned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail(error);
  return data ? postFromRow(data as ChatterPostRow) : null;
}

/** Posts a quote may point at that aren't loaded yet. */
export async function loadPostsById(ids: string[]): Promise<ChatterPost[]> {
  if (!ids.length) return [];
  const { data, error } = await getBrowserSupabase()
    .from("chatter_post")
    .select(COLUMNS)
    .in("id", ids);
  fail(error);
  return ((data ?? []) as ChatterPostRow[]).map(postFromRow);
}

export interface ChatterState {
  agreedAt: string | null;
  lastReadAt: string | null;
  mutedUntil: string | null;
}

/** The signed-in person's Chatter state on the team. */
export async function myState(teamId: string, userId: string): Promise<ChatterState> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_member")
    .select("agreed_at, last_read_at, muted_until")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  fail(error);
  const row = data as {
    agreed_at: string | null;
    last_read_at: string | null;
    muted_until: string | null;
  } | null;
  return {
    agreedAt: row?.agreed_at ?? null,
    lastReadAt: row?.last_read_at ?? null,
    mutedUntil: row?.muted_until ?? null,
  };
}

/** Everyone currently paused on the team (coaches and managers see these). */
export async function pausedMembers(teamId: string): Promise<{ userId: string; until: string }[]> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_member")
    .select("user_id, muted_until")
    .eq("team_id", teamId)
    .gt("muted_until", new Date().toISOString());
  fail(error);
  return ((data ?? []) as { user_id: string; muted_until: string }[]).map((r) => ({
    userId: r.user_id,
    until: r.muted_until,
  }));
}

export async function agree(teamId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("agree_chatter", { p_team: teamId })).error);
}

export async function markRead(teamId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("mark_chatter_read", { p_team: teamId })).error);
}

export async function unreadCount(teamId: string): Promise<number> {
  const { data, error } = await getBrowserSupabase().rpc("chatter_unread", { p_team: teamId });
  fail(error);
  return typeof data === "number" ? data : 0;
}

export async function sendPost(
  teamId: string,
  authorId: string,
  body: string,
  quotePostId: string | null,
): Promise<ChatterPost> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_post")
    .insert({ team_id: teamId, author_id: authorId, body, quote_post_id: quotePostId })
    .select(COLUMNS)
    .single();
  fail(error);
  return postFromRow(data as ChatterPostRow);
}

export async function editPost(postId: string, body: string): Promise<void> {
  fail(
    (await getBrowserSupabase().rpc("edit_chatter_post", { p_post: postId, p_body: body })).error,
  );
}

export async function removePost(postId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("remove_chatter_post", { p_post: postId })).error);
}

export async function pinPost(postId: string, pin: boolean): Promise<void> {
  fail((await getBrowserSupabase().rpc("pin_chatter_post", { p_post: postId, p_pin: pin })).error);
}

export async function reportPost(
  postId: string,
  reason: ReportReason,
  note: string,
): Promise<void> {
  fail(
    (
      await getBrowserSupabase().rpc("report_chatter_post", {
        p_post: postId,
        p_reason: reason,
        p_note: note,
      })
    ).error,
  );
}

export interface ChatterReport {
  id: string;
  postId: string;
  reason: ReportReason;
  note: string | null;
  createdAt: string;
}

/** Open reports on the team (coaches and managers). */
export async function openReports(teamId: string): Promise<ChatterReport[]> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_report")
    .select("id, post_id, reason, note, created_at")
    .eq("team_id", teamId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      post_id: string;
      reason: ReportReason;
      note: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    postId: r.post_id,
    reason: r.reason,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function resolveReport(reportId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("resolve_chatter_report", { p_report: reportId })).error);
}

/** Pause someone's posting until a time, or lift it (null). */
export async function pauseMember(
  teamId: string,
  userId: string,
  until: string | null,
): Promise<void> {
  fail(
    (
      await getBrowserSupabase().rpc("mute_chatter_member", {
        p_team: teamId,
        p_user: userId,
        p_until: until,
      })
    ).error,
  );
}

/** New and changed posts as they happen. Returns a function that stops listening. */
export function subscribe(
  teamId: string,
  onPost: (post: ChatterPost) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const supabase = getBrowserSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`chatter:${teamId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chatter_post", filter: `team_id=eq.${teamId}` },
      (payload) => {
        const row = payload.new as Partial<ChatterPostRow> | undefined;
        if (row && row.id && row.team_id === teamId) onPost(postFromRow(row as ChatterPostRow));
      },
    )
    .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function readCache(teamId: string): ChatterPost[] {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + teamId);
    const posts = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(posts) ? (posts as ChatterPost[]) : [];
  } catch {
    return [];
  }
}

export function writeCache(teamId: string, posts: ChatterPost[]): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + teamId, JSON.stringify(posts.slice(-PAGE)));
  } catch {
    // Storage full or blocked: the feed still works online.
  }
}
