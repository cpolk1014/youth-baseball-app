"use client";

// Coach Chatter: one chat feed per club for its director, admins and the coaches of every
// club team. Everything here is seen by all of them across teams; parents never see it.
// It reuses team Chatter's pieces (posts, composer, reactions, photos).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  canEdit,
  feedItems,
  mergePosts,
  myReactions,
  pinnedPost,
  previewText,
  reactorNames,
  REACTIONS_PER_PERSON,
  toggleReaction,
  type Author,
  type ChatterPhoto,
  type ChatterPost,
  type Reaction,
} from "@/lib/chatter/feed";
import type { CoachClub, CoachPerson } from "@/lib/data/coach-chatter-backend";
import { refreshUnread } from "@/lib/chatter/unread";
import { useAppData } from "@/lib/data/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";
import { Composer, EditForm, PhotoViewer, PostBubble, ReactionPicker } from "./ChatterScreen";
import { preparePhoto } from "./photo";
import { announce } from "@/lib/push/client";
import { NotifyBar } from "./NotifyBar";

const backend = () => import("@/lib/data/coach-chatter-backend");
const chatter = () => import("@/lib/data/chatter-backend");
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const secondary =
  "flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100";
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";

export function CoachChatterScreen() {
  const data = useAppData();
  const me = data?.me.userId ?? null;
  const asked = useSearchParams().get("club");
  const [clubs, setClubs] = useState<CoachClub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !me) return;
    let current = true;
    void backend()
      .then((m) => m.myCoachClubs())
      .then((c) => current && setClubs(c))
      .catch((e: unknown) => current && setError(message(e)));
    return () => {
      current = false;
    };
  }, [me]);

  const club = clubs?.find((c) => c.id === (picked ?? asked)) ?? clubs?.[0] ?? null;

  const shell = (children: React.ReactNode) => (
    <AppShell title="Coach Chatter" subtitle={club?.name} tab="coachchatter" bare>
      {children}
    </AppShell>
  );

  if (!isSupabaseConfigured || (data && !me)) {
    return shell(
      <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-lg">
        Sign in to read and post.
      </p>,
    );
  }
  if (error) return shell(<p className="text-base text-red-700">{error}</p>);
  if (!clubs || !me) return shell(<Loading />);
  if (!club) {
    return shell(
      <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-lg">
        Coach Chatter is a chat for a club&apos;s director and the coaches of its teams. It shows up
        once your team enters its club code, for the team&apos;s coaches.
      </p>,
    );
  }
  return shell(
    <>
      {clubs.length > 1 && (
        <div className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap gap-2">
          {clubs.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              aria-pressed={c.id === club.id}
              className={`h-11 rounded-full border-2 px-4 text-base font-bold ${c.id === club.id ? "border-[var(--team)] bg-[var(--team)] text-white" : "border-slate-300 bg-white"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <Feed key={club.id} club={club} me={me} />
    </>,
  );
}

function Feed({ club, me }: { club: CoachClub; me: string }) {
  const clubId = club.id;
  const [posts, setPosts] = useState<ChatterPost[]>([]);
  const [quoted, setQuoted] = useState<Record<string, ChatterPost>>({});
  const [pinned, setPinned] = useState<ChatterPost | null>(null);
  const [people, setPeople] = useState<Record<string, CoachPerson>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatterPost | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatterPost | null>(null);
  const [editing, setEditing] = useState<ChatterPost | null>(null);
  const [reactingTo, setReactingTo] = useState<ChatterPost | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ photos: ChatterPhoto[]; index: number } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const scrollToEnd = (smooth = false) =>
    requestAnimationFrame(() =>
      bottom.current?.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "auto" }),
    );

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const m = await backend();
      try {
        const [page, pin, who] = await Promise.all([
          m.loadPosts(clubId),
          m.loadPinned(clubId),
          m.coachPeople(clubId),
        ]);
        if (cancelled) return;
        setPosts(page);
        setHasOlder(page.length >= m.PAGE);
        setPinned(pin);
        setPeople(who);
        setLoadError(null);
        scrollToEnd();
        void m.markRead(clubId).then(refreshUnread, () => undefined);
      } catch (e) {
        if (!cancelled) setLoadError(message(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
      stop = m.subscribe(
        clubId,
        (post) => {
          setPosts((prev) => mergePosts(prev, [post]));
          setPinned((prev) =>
            post.pinnedAt && !post.removedAt ? post : prev?.id === post.id ? null : prev,
          );
          if (nearBottom.current) scrollToEnd(true);
          if (document.visibilityState === "visible")
            void m.markRead(clubId).then(refreshUnread, () => undefined);
        },
        setOnline,
      );
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [clubId]);

  // Track whether the reader is at the bottom, so new posts only scroll them when they are.
  useEffect(() => {
    const onScroll = () => {
      nearBottom.current =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Quotes of posts older than the loaded page.
  useEffect(() => {
    const have = new Set([...posts.map((p) => p.id), ...Object.keys(quoted)]);
    const missing = [
      ...new Set(
        posts.map((p) => p.quotePostId).filter((id): id is string => !!id && !have.has(id)),
      ),
    ];
    if (!missing.length) return;
    void backend()
      .then((m) => m.loadPostsById(missing))
      .then((found) =>
        setQuoted((prev) => ({ ...prev, ...Object.fromEntries(found.map((p) => [p.id, p])) })),
      )
      .catch(() => undefined);
  }, [posts, quoted]);

  // Signed links to the feed's thumbnails.
  useEffect(() => {
    const want = [
      ...new Set(
        [...posts, ...Object.values(quoted)].flatMap((p) => p.photos.map((ph) => ph.thumb)),
      ),
    ].filter((p) => !asked.current.has(p));
    if (!want.length) return;
    for (const p of want) asked.current.add(p);
    void chatter()
      .then((c) => c.photoUrls(want))
      .then((u) => setUrls((prev) => ({ ...prev, ...u })))
      .catch(() => undefined);
  }, [posts, quoted]);

  const items = useMemo(() => feedItems(posts), [posts]);
  const pin = pinned ?? pinnedPost(posts);
  const findPost = (id: string | null) =>
    id ? (posts.find((p) => p.id === id) ?? quoted[id] ?? null) : null;

  const authorFor = (id: string | null): Author => {
    const person = id ? people[id] : undefined;
    if (!person) return { name: "Former coach", role: null, staff: false };
    return {
      name: person.name?.trim() || (person.admin ? "Club admin" : "Coach"),
      role: person.label,
      staff: person.admin,
    };
  };
  const nameOf = (id: string) => authorFor(id).name;

  const jumpTo = (id: string) => {
    const el = document.getElementById(`post-${id}`);
    if (!el) {
      toast("That post is further back. Tap “Earlier posts” to load it.");
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-4", "ring-amber-300");
    setTimeout(() => el.classList.remove("ring-4", "ring-amber-300"), 1500);
  };

  const loadOlder = async () => {
    const first = posts[0];
    if (!first) return;
    try {
      const m = await backend();
      const older = await m.loadPosts(clubId, first.createdAt);
      setHasOlder(older.length >= m.PAGE);
      setPosts((prev) => mergePosts(prev, older));
    } catch (e) {
      toast(message(e));
    }
  };

  const reactTo = async (post: ChatterPost, emoji: string) => {
    const on = !myReactions(post.reactions, me).includes(emoji);
    if (on && myReactions(post.reactions, me).length >= REACTIONS_PER_PERSON) {
      toast(`Up to ${REACTIONS_PER_PERSON} emoji on a post. Tap one of yours to take it back.`);
      return;
    }
    const show = (reactions: Reaction[]) =>
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, reactions } : p)));
    show(toggleReaction(post.reactions, emoji, me));
    const m = await backend();
    try {
      await m.react(post.id, emoji, on);
    } catch (e) {
      toast(message(e));
      show(post.reactions);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <NotifyBar userId={me} scopeId={clubId} scopeName={club.name} category="coach_chatter" />
      <p className="mb-3 rounded-xl bg-slate-50 p-3 text-base text-slate-700">
        🔒 Only {club.name}&apos;s director, club admins and its teams&apos; coaches see this.
        Parents never do.
      </p>
      {pin && (
        <button
          onClick={() => jumpTo(pin.id)}
          className="sticky top-2 z-10 mb-3 flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-left shadow-sm"
        >
          <span aria-hidden="true">📌</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-amber-900">Pinned by the club</span>
            <span className="block truncate text-base">{previewText(pin)}</span>
          </span>
        </button>
      )}
      {!loaded && <Loading />}
      {loadError && (
        <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">
          Couldn&apos;t load the coaches chat: {loadError}
        </p>
      )}
      {hasOlder && (
        <button onClick={() => void loadOlder()} className={`${secondary} mb-3`}>
          Earlier posts
        </button>
      )}
      {loaded && !loadError && posts.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-center text-lg text-slate-600">
          👋 Nobody&apos;s posted yet. Say hi to the club&apos;s coaches.
        </p>
      )}

      <ol className="flex flex-col">
        {items.map(({ post, day, grouped }) => (
          <li key={post.id} className={grouped ? "mt-1" : "mt-3"}>
            {day && (
              <p className="my-3 text-center text-sm font-bold tracking-wide text-slate-500 uppercase">
                {day}
              </p>
            )}
            <PostBubble
              post={post}
              mine={post.authorId === me}
              grouped={grouped}
              authorFor={authorFor}
              quote={findPost(post.quotePostId)}
              onQuoteTap={jumpTo}
              onActions={() => setActionsFor(post)}
              urls={urls}
              onPhoto={(index) => setViewer({ photos: post.photos, index })}
              poll={null}
              results={undefined}
              onVote={() => undefined}
              me={me}
              nameOf={nameOf}
              canReact={online}
              onReact={(emoji) => void reactTo(post, emoji)}
              onAddReaction={() => setReactingTo(post)}
            />
          </li>
        ))}
      </ol>
      <div ref={bottom} className="h-2" />

      <Composer
        key={replyTo?.id ?? "new"}
        placeholder="Post to the club's coaches…"
        disabledReason={null}
        offline={!online && loaded}
        replyTo={replyTo}
        replyAuthor={replyTo ? nameOf(replyTo.authorId ?? "") : ""}
        onCancelReply={() => setReplyTo(null)}
        canPostPhotos
        onNewPoll={null}
        onSend={async (body, files) => {
          const m = await backend();
          const c = await chatter();
          const uploaded: ChatterPhoto[] = [];
          try {
            for (const file of files) {
              uploaded.push(await m.uploadPhoto(clubId, me, await preparePhoto(file)));
            }
            const post = await m.sendPost(clubId, me, body, replyTo?.id ?? null, uploaded);
            announce("coach", post.id);
            setPosts((prev) => mergePosts(prev, [post]));
          } catch (e) {
            void c.deletePhotos(uploaded).catch(() => undefined);
            throw e;
          }
          setReplyTo(null);
          scrollToEnd(true);
        }}
      />

      <Sheet open={reactingTo !== null} title="React" onClose={() => setReactingTo(null)}>
        {reactingTo && (
          <ReactionPicker
            mine={myReactions(reactingTo.reactions, me)}
            onPick={(emoji) => {
              void reactTo(reactingTo, emoji);
              setReactingTo(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={actionsFor !== null} title="Post" onClose={() => setActionsFor(null)}>
        {actionsFor && (
          <Actions
            post={actionsFor}
            me={me}
            admin={club.admin}
            authorName={nameOf(actionsFor.authorId ?? "")}
            pinned={pin?.id === actionsFor.id}
            canReact={online}
            reactors={actionsFor.reactions.map((r) => ({
              emoji: r.emoji,
              names: reactorNames(r.userIds, me, nameOf),
            }))}
            onReact={(emoji) => {
              void reactTo(actionsFor, emoji);
              setActionsFor(null);
            }}
            onReply={() => {
              setReplyTo(actionsFor);
              setActionsFor(null);
            }}
            onEdit={() => {
              setEditing(actionsFor);
              setActionsFor(null);
            }}
            onDone={() => setActionsFor(null)}
          />
        )}
      </Sheet>

      <Sheet open={editing !== null} title="Edit post" onClose={() => setEditing(null)}>
        {editing && (
          <EditForm
            post={editing}
            onSave={async (body) => {
              await (await backend()).editPost(editing.id, body);
              setPosts((prev) =>
                prev.map((p) =>
                  p.id === editing.id ? { ...p, body, editedAt: new Date().toISOString() } : p,
                ),
              );
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      {viewer && (
        <PhotoViewer
          photos={viewer.photos}
          start={viewer.index}
          thumbs={urls}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function Actions({
  post,
  me,
  admin,
  authorName,
  pinned,
  canReact,
  reactors,
  onReact,
  onReply,
  onEdit,
  onDone,
}: {
  post: ChatterPost;
  me: string;
  admin: boolean;
  authorName: string;
  pinned: boolean;
  canReact: boolean;
  reactors: { emoji: string; names: string }[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="line-clamp-3 rounded-xl bg-slate-50 p-3 text-base text-slate-700">
        <b>{authorName}:</b> {previewText(post, 200)}
      </p>
      {canReact && <ReactionPicker mine={myReactions(post.reactions, me)} onPick={onReact} />}
      {reactors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-base">
          {reactors.map((r) => (
            <li key={r.emoji}>
              <span className="mr-2 text-lg">{r.emoji}</span>
              {r.names}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button className={primary} onClick={onReply}>
        ↩︎ Reply
      </button>
      <button
        className={secondary}
        onClick={() => run(() => navigator.clipboard.writeText(post.body), "Copied")}
      >
        Copy text
      </button>
      {canEdit(post, me) && (
        <button className={secondary} onClick={onEdit}>
          Edit
        </button>
      )}
      {admin && (
        <button
          disabled={busy}
          className={secondary}
          onClick={() =>
            run(
              async () => (await backend()).pinPost(post.id, !pinned),
              pinned ? "Unpinned" : "📌 Pinned to the top",
            )
          }
        >
          {pinned ? "Unpin" : "📌 Pin to the top"}
        </button>
      )}
      {(admin || post.authorId === me) && (
        <button
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-red-300 bg-white text-base font-bold text-red-700 active:bg-red-50"
          onClick={() => {
            if (!window.confirm("Remove this post for every coach?")) return;
            void run(async () => {
              await (await backend()).removePost(post.id);
              await (await chatter()).deletePhotos(post.photos).catch(() => undefined);
            }, "Post removed");
          }}
        >
          Remove post
        </button>
      )}
    </div>
  );
}
