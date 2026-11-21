// Coach Chatter: one chat feed per club for its admins and the coaches of its teams. Posts use
// the same shape as team Chatter (teamId holds the club's id) so the feed's pieces are shared.
// The database decides who's in it (club_coach_member) and enforces every rule.
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  postFromRow,
  type ChatterPhoto,
  type ChatterPost,
  type ChatterPostRow,
} from "@/lib/chatter/feed";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ChatterError } from "./chatter-backend";

const COLUMNS =
  "id, organization_id, author_id, body, quote_post_id, photos, reactions, created_at, edited_at, pinned_at, removed_at";
export const PAGE = 50;
const PHOTOS = "chatter-photos";

type Row = Omit<ChatterPostRow, "team_id"> & { organization_id: string };
const fromRow = (r: Row): ChatterPost => postFromRow({ ...r, team_id: r.organization_id });

function fail(error: { message: string; code?: string } | null): void {
  if (error) throw new ChatterError(error.message, error.code);
}

export interface CoachClub {
  id: string;
  name: string;
  logo: string | null;
  color: string | null;
  /** A director or admin of the club (pins, removes any post). */
  admin: boolean;
}

/** The clubs whose coaches feed I'm in. */
export async function myCoachClubs(): Promise<CoachClub[]> {
  const { data, error } = await getBrowserSupabase().rpc("my_coach_clubs");
  fail(error);
  return (
    (data ?? []) as {
      id: string;
      name: string;
      logo_path: string | null;
      color: string | null;
      admin: boolean;
    }[]
  ).map((r) => ({ id: r.id, name: r.name, logo: r.logo_path, color: r.color, admin: r.admin }));
}

export interface CoachPerson {
  name: string | null;
  /** "Director", "Club admin" or "Coach · 10U Canes". */
  label: string;
  admin: boolean;
}

export async function coachPeople(clubId: string): Promise<Record<string, CoachPerson>> {
  const { data, error } = await getBrowserSupabase().rpc("club_coach_people", { p_org: clubId });
  fail(error);
  return Object.fromEntries(
    ((data ?? []) as { user_id: string; name: string | null; label: string; admin: boolean }[]).map(
      (r) => [r.user_id, { name: r.name, label: r.label, admin: r.admin }],
    ),
  );
}

/** The newest posts (oldest first), or the page before `before`. */
export async function loadPosts(clubId: string, before?: string): Promise<ChatterPost[]> {
  let q = getBrowserSupabase()
    .from("club_coach_post")
    .select(COLUMNS)
    .eq("organization_id", clubId)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  fail(error);
  return ((data ?? []) as Row[]).map(fromRow).reverse();
}

export async function loadPinned(clubId: string): Promise<ChatterPost | null> {
  const { data, error } = await getBrowserSupabase()
    .from("club_coach_post")
    .select(COLUMNS)
    .eq("organization_id", clubId)
    .not("pinned_at", "is", null)
    .is("removed_at", null)
    .order("pinned_at", { ascending: false })
    .limit(1);
  fail(error);
  const row = (data ?? [])[0] as Row | undefined;
  return row ? fromRow(row) : null;
}

export async function loadPostsById(ids: string[]): Promise<ChatterPost[]> {
  if (!ids.length) return [];
  const { data, error } = await getBrowserSupabase()
    .from("club_coach_post")
    .select(COLUMNS)
    .in("id", ids);
  fail(error);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function sendPost(
  clubId: string,
  authorId: string,
  body: string,
  quotePostId: string | null,
  photos: ChatterPhoto[],
): Promise<ChatterPost> {
  const { data, error } = await getBrowserSupabase()
    .from("club_coach_post")
    .insert({
      organization_id: clubId,
      author_id: authorId,
      body,
      quote_post_id: quotePostId,
      photos,
    })
    .select(COLUMNS)
    .single();
  fail(error);
  return fromRow(data as Row);
}

/** A photo in my own folder of the club's coaches feed. */
export async function uploadPhoto(
  clubId: string,
  userId: string,
  photo: { full: Blob; thumb: Blob; w: number; h: number },
): Promise<ChatterPhoto> {
  const base = `clubcoaches/${clubId}/${userId}/${crypto.randomUUID()}`;
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

export async function editPost(postId: string, body: string): Promise<void> {
  fail(
    (await getBrowserSupabase().rpc("edit_club_coach_post", { p_post: postId, p_body: body }))
      .error,
  );
}

export async function removePost(postId: string): Promise<void> {
  fail((await getBrowserSupabase().rpc("remove_club_coach_post", { p_post: postId })).error);
}

export async function pinPost(postId: string, pin: boolean): Promise<void> {
  fail(
    (await getBrowserSupabase().rpc("pin_club_coach_post", { p_post: postId, p_pin: pin })).error,
  );
}

export async function react(postId: string, emoji: string, on: boolean): Promise<void> {
  fail(
    (
      await getBrowserSupabase().rpc("react_club_coach_post", {
        p_post: postId,
        p_emoji: emoji,
        p_on: on,
      })
    ).error,
  );
}

/** New and changed posts as they happen. Returns a function that stops listening. */
export function subscribe(
  clubId: string,
  onPost: (post: ChatterPost) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const supabase = getBrowserSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`coach-chatter:${clubId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "club_coach_post",
        filter: `organization_id=eq.${clubId}`,
      },
      (payload) => {
        const row = payload.new as Partial<Row> | undefined;
        if (row && row.id && row.organization_id === clubId) onPost(fromRow(row as Row));
      },
    )
    .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** The signed-in person's id (for posting from the club page). */
export async function myUserId(): Promise<string> {
  const { data } = await getBrowserSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ChatterError("Sign in again to post.");
  return id;
}
