// Chatter, the team's chat feed: reads, writes and live updates through Supabase. The
// database decides who reads and posts (team members only) and enforces every rule.
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  photoPaths,
  pollFromRow,
  type ChatterPoll,
  type ChatterPollRow,
  type PollChoice,
  postFromRow,
  type ChatterChannel,
  type ChatterPerson,
  type ChatterPhoto,
  type ChatterPost,
  type ChatterPostRow,
  type ReportReason,
} from "@/lib/chatter/feed";
import type { ChatterGif } from "@/lib/chatter/gif";
import { getBrowserSupabase } from "@/lib/supabase/client";

const COLUMNS =
  "id, team_id, author_id, body, quote_post_id, kind, photos, gif, mentions, reactions, club, from_fungo, channel, created_at, edited_at, pinned_at, removed_at";
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
export async function loadPosts(
  teamId: string,
  before?: string,
  channel: ChatterChannel = "team",
): Promise<ChatterPost[]> {
  let q = getBrowserSupabase()
    .from("chatter_post")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  fail(error);
  return ((data ?? []) as ChatterPostRow[]).map(postFromRow).reverse();
}

/** The pinned post, which may be older than the loaded page. */
export async function loadPinned(
  teamId: string,
  channel: ChatterChannel = "team",
): Promise<ChatterPost | null> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_post")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .eq("channel", channel)
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

export async function markRead(teamId: string, channel: ChatterChannel = "team"): Promise<void> {
  fail(
    (
      await getBrowserSupabase().rpc("mark_chatter_channel_read", {
        p_team: teamId,
        p_channel: channel,
      })
    ).error,
  );
}

/** New posts by others in each channel. */
export async function unreadCounts(teamId: string): Promise<{ team: number; parents: number }> {
  const { data, error } = await getBrowserSupabase().rpc("chatter_unread_channels", {
    p_team: teamId,
  });
  fail(error);
  const row = (data as { team: number; parents: number }[] | null)?.[0];
  return { team: row?.team ?? 0, parents: row?.parents ?? 0 };
}

/** Everyone who can post in the team's Team channel (its members and the club's admins). */
export async function chatterPeople(teamId: string): Promise<ChatterPerson[]> {
  const { data, error } = await getBrowserSupabase().rpc("chatter_people", { p_team: teamId });
  fail(error);
  return ((data ?? []) as { user_id: string; name: string | null; role: string; kids: string[] }[]).map(
    (r) => ({ userId: r.user_id, name: r.name, role: r.role, kids: r.kids ?? [] }),
  );
}

export async function sendPost(
  teamId: string,
  authorId: string,
  body: string,
  quotePostId: string | null,
  photos: ChatterPhoto[] = [],
  gif: ChatterGif | null = null,
  mentions: string[] = [],
  channel: ChatterChannel = "team",
): Promise<ChatterPost> {
  const { data, error } = await getBrowserSupabase()
    .from("chatter_post")
    .insert({
      team_id: teamId,
      author_id: authorId,
      body,
      quote_post_id: quotePostId,
      photos,
      gif,
      mentions,
      channel,
    })
    .select(COLUMNS)
    .single();
  fail(error);
  return postFromRow(data as ChatterPostRow);
}

const PHOTOS = "chatter-photos";

/** Upload a photo (already shrunk and stripped) to the poster's own folder. */
export async function uploadPhoto(
  teamId: string,
  userId: string,
  photo: { full: Blob; thumb: Blob; w: number; h: number },
): Promise<ChatterPhoto> {
  const { path, thumb } = photoPaths(teamId, userId, crypto.randomUUID());
  const bucket = getBrowserSupabase().storage.from(PHOTOS);
  const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([
    bucket.upload(path, photo.full, opts),
    bucket.upload(thumb, photo.thumb, opts),
  ]);
  const error = a.error ?? b.error;
  if (error) {
    void bucket.remove([path, thumb]);
    throw new ChatterError(
      /row-level security|unauthorized|403/i.test(error.message)
        ? "On this team, only coaches and managers post photos."
        : "Couldn't upload that photo. Try again.",
    );
  }
  return { path, thumb, w: photo.w, h: photo.h };
}

/** A club admin's photo for a club post: one copy that every team's copy points at. */
export async function uploadClubPhoto(
  clubId: string,
  photo: { full: Blob; thumb: Blob; w: number; h: number },
): Promise<ChatterPhoto> {
  const base = `club/${clubId}/${crypto.randomUUID()}`;
  const path = `${base}.jpg`;
  const thumb = `${base}-t.jpg`;
  const bucket = getBrowserSupabase().storage.from(PHOTOS);
  const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([
    bucket.upload(path, photo.full, opts),
    bucket.upload(thumb, photo.thumb, opts),
  ]);
  if (a.error ?? b.error) {
    void bucket.remove([path, thumb]);
    throw new ChatterError("Couldn't upload that photo. Try again.");
  }
  return { path, thumb, w: photo.w, h: photo.h };
}

/** Delete photo files (a removed post's, or uploads that never got posted). */
export async function deletePhotos(photos: ChatterPhoto[]): Promise<void> {
  if (!photos.length) return;
  await getBrowserSupabase()
    .storage.from(PHOTOS)
    .remove(photos.flatMap((p) => [p.path, p.thumb]));
}

/** Links to photos, good for 6 hours (the bucket is private). */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await getBrowserSupabase()
    .storage.from(PHOTOS)
    .createSignedUrls(paths, 6 * 3600);
  if (error) return {};
  return Object.fromEntries(
    (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])),
  );
}

/** Who may post photos, or start polls: everyone on the team, or only coaches and managers. */
export type PhotoSetting = "everyone" | "staff";
export interface ChatterSettings {
  photos: PhotoSetting;
  polls: PhotoSetting;
}

export async function chatterSettings(teamId: string): Promise<ChatterSettings> {
  const { data, error } = await getBrowserSupabase()
    .from("team")
    .select("chatter_photos, chatter_polls")
    .eq("id", teamId)
    .maybeSingle();
  fail(error);
  const row = data as { chatter_photos?: string; chatter_polls?: string } | null;
  return {
    photos: row?.chatter_photos === "staff" ? "staff" : "everyone",
    polls: row?.chatter_polls === "everyone" ? "everyone" : "staff",
  };
}

export async function setChatterSetting(
  teamId: string,
  key: keyof ChatterSettings,
  value: PhotoSetting,
): Promise<void> {
  const { data, error } = await getBrowserSupabase()
    .from("team")
    .update(key === "photos" ? { chatter_photos: value } : { chatter_polls: value })
    .eq("id", teamId)
    .select("id");
  fail(error);
  if (!data?.length) throw new ChatterError("Only coaches and managers change this.");
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
  onPoll?: (poll: ChatterPoll) => void,
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
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chatter_poll", filter: `team_id=eq.${teamId}` },
      (payload) => {
        const row = payload.new as Partial<ChatterPollRow> | undefined;
        if (row && row.post_id) onPoll?.(pollFromRow(row as ChatterPollRow));
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
    // Copies saved before photos or reactions existed have none.
    return Array.isArray(posts)
      ? (posts as ChatterPost[]).map((p) => ({
          ...p,
          kind: p.kind ?? "post",
          photos: p.photos ?? [],
          reactions: p.reactions ?? [],
          club: p.club ?? null,
          gif: p.gif ?? null,
          mentions: p.mentions ?? [],
          channel: p.channel ?? "team",
        }))
      : [];
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

// ── Reactions ──

/** Put my emoji on a post (on) or take it back. The post's change comes back live. */
export async function react(postId: string, emoji: string, on: boolean): Promise<void> {
  fail(
    (
      await getBrowserSupabase().rpc("react_chatter_post", {
        p_post: postId,
        p_emoji: emoji,
        p_on: on,
      })
    ).error,
  );
}

// ── Polls ──

export async function createPoll(
  teamId: string,
  question: string,
  options: string[],
  multi: boolean,
  anonymous: boolean,
  closesAt: string | null,
  channel: ChatterChannel = "team",
): Promise<string> {
  const { data, error } = await getBrowserSupabase().rpc("create_chatter_poll", {
    p_channel: channel,
    p_team: teamId,
    p_question: question,
    p_options: options,
    p_multi: multi,
    p_anonymous: anonymous,
    p_closes_at: closesAt,
  });
  fail(error);
  return data as string;
}

export async function loadPolls(postIds: string[]): Promise<ChatterPoll[]> {
  if (!postIds.length) return [];
  const { data, error } = await getBrowserSupabase()
    .from("chatter_poll")
    .select("post_id, options, multi, anonymous, closes_at, closed_at, version")
    .in("post_id", postIds);
  fail(error);
  return ((data ?? []) as ChatterPollRow[]).map(pollFromRow);
}

/** Each poll's results, choice by choice. */
export async function pollResults(postIds: string[]): Promise<Record<string, PollChoice[]>> {
  if (!postIds.length) return {};
  const { data, error } = await getBrowserSupabase().rpc("chatter_poll_results", {
    p_posts: postIds,
  });
  fail(error);
  const out: Record<string, PollChoice[]> = {};
  for (const r of (data ?? []) as {
    post_id: string;
    option: number;
    votes: number;
    mine: boolean;
    voters: string[] | null;
  }[]) {
    (out[r.post_id] ??= [])[r.option] = { votes: r.votes, mine: r.mine, voters: r.voters };
  }
  return out;
}

export async function vote(postId: string, options: number[]): Promise<void> {
  fail(
    (await getBrowserSupabase().rpc("vote_chatter_poll", { p_post: postId, p_options: options }))
      .error,
  );
}

export async function closePoll(postId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("close_chatter_poll", { p_post: postId })).error);
}
