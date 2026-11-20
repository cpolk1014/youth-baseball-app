"use client";

// Chatter: the team's own chat feed. Adults only (team members; kids have no accounts), no
// private messages, coaches and managers moderate. The database enforces all of it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BODY_MAX,
  PAUSES,
  REPORT_REASONS,
  authorOf,
  canEdit,
  canModerate,
  canRemove,
  feedItems,
  mergePosts,
  pinnedPost,
  snippet,
  timeLabel,
  type ChatterPost,
  type ReportReason,
} from "@/lib/chatter/feed";
import { useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell, Loading } from "../AppShell";
import { MicField } from "../Dictate";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";
import type { ChatterReport, ChatterState } from "@/lib/data/chatter-backend";

const backend = () => import("@/lib/data/chatter-backend");
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const secondary =
  "flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100";

export function ChatterScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Chatter" tab="chatter">
        <Loading />
      </AppShell>
    );
  }
  if (!isSupabaseConfigured || !data.me.userId) {
    return (
      <AppShell title="Chatter" tab="chatter">
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-lg">
          Chatter is your team&apos;s chat. Sign in to read and post.
        </p>
      </AppShell>
    );
  }
  return <Chatter key={data.team.id} data={data} me={data.me.userId} />;
}

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function Chatter({ data, me }: { data: AppData; me: string }) {
  const teamId = data.team.id;
  const role = data.me.role;
  const moderator = canModerate(role);
  const paid = data.plan ? data.plan.paid : true;

  const [posts, setPosts] = useState<ChatterPost[]>([]);
  const [quoted, setQuoted] = useState<Record<string, ChatterPost>>({});
  const [pinned, setPinned] = useState<ChatterPost | null>(null);
  const [state, setState] = useState<ChatterState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [reports, setReports] = useState<ChatterReport[]>([]);
  const [paused, setPaused] = useState<{ userId: string; until: string }[]>([]);

  const [replyTo, setReplyTo] = useState<ChatterPost | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatterPost | null>(null);
  const [editing, setEditing] = useState<ChatterPost | null>(null);
  const [reporting, setReporting] = useState<ChatterPost | null>(null);
  const [showReports, setShowReports] = useState(false);

  const bottom = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const team = useMemo(
    () => ({ members: data.members, guardians: data.guardians, players: data.players }),
    [data.members, data.guardians, data.players],
  );

  const scrollToEnd = (smooth = false) =>
    requestAnimationFrame(() =>
      bottom.current?.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "auto" }),
    );

  const refreshModeration = useCallback(async () => {
    if (!moderator) return;
    const m = await backend();
    const [r, p] = await Promise.all([m.openReports(teamId), m.pausedMembers(teamId)]);
    setReports(r);
    setPaused(p);
  }, [moderator, teamId]);

  // First load: the device copy right away, then the server's.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const m = await backend();
      const cached = m.readCache(teamId);
      if (cached.length) {
        setPosts(cached);
        scrollToEnd();
      }
      try {
        const [page, pin, mine] = await Promise.all([
          m.loadPosts(teamId),
          m.loadPinned(teamId),
          m.myState(teamId, me),
        ]);
        if (cancelled) return;
        setPosts(page);
        setHasOlder(page.length >= m.PAGE);
        setPinned(pin);
        setState(mine);
        setLoadError(null);
        if (mine.agreedAt) void m.markRead(teamId).catch(() => undefined);
        scrollToEnd();
        void refreshModeration().catch(() => undefined);
      } catch (e) {
        if (!cancelled) setLoadError(cached.length ? null : message(e));
        if (!cancelled && !cached.length) setState(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
      stop = m.subscribe(
        teamId,
        (post) => {
          setPosts((prev) => mergePosts(prev, [post]));
          setPinned((prev) =>
            post.pinnedAt && !post.removedAt ? post : prev?.id === post.id ? null : prev,
          );
          if (nearBottom.current) scrollToEnd(true);
          if (document.visibilityState === "visible")
            void m.markRead(teamId).catch(() => undefined);
          if (moderator) void refreshModeration().catch(() => undefined);
        },
        setOnline,
      );
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [teamId, me, moderator, refreshModeration]);

  // Keep the last posts on the device for the dugout.
  useEffect(() => {
    if (!loaded || !posts.length) return;
    void backend().then((m) => m.writeCache(teamId, posts));
  }, [loaded, posts, teamId]);

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

  useEffect(() => {
    const onScroll = () => {
      nearBottom.current =
        window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const findPost = (id: string | null) =>
    id ? (posts.find((p) => p.id === id) ?? quoted[id] ?? null) : null;

  const loadOlder = async () => {
    const m = await backend();
    const first = posts[0];
    if (!first) return;
    try {
      const older = await m.loadPosts(teamId, first.createdAt);
      setHasOlder(older.length >= m.PAGE);
      setPosts((prev) => mergePosts(prev, older));
    } catch (e) {
      toast(message(e));
    }
  };

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

  const mutedUntil =
    state?.mutedUntil && new Date(state.mutedUntil) > new Date() ? state.mutedUntil : null;

  if (loaded && state && !state.agreedAt) {
    return (
      <AppShell title="Chatter" subtitle={data.team.name} tab="chatter">
        <Agree
          onAgree={async () => {
            const m = await backend();
            await m.agree(teamId);
            setState(await m.myState(teamId, me));
            scrollToEnd();
          }}
        />
      </AppShell>
    );
  }

  const items = feedItems(posts);
  const pin = pinned ?? pinnedPost(posts);

  return (
    <AppShell title="Chatter" subtitle={data.team.name} tab="chatter">
      <div className="mx-auto flex max-w-3xl flex-col">
        {moderator && reports.length > 0 && (
          <button
            onClick={() => setShowReports(true)}
            className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-left text-base font-bold text-red-900"
          >
            🚩 {reports.length} post{reports.length === 1 ? "" : "s"} reported. Take a look.
          </button>
        )}
        {pin && (
          <button
            onClick={() => jumpTo(pin.id)}
            className="sticky top-2 z-10 mb-3 flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-left shadow-sm"
          >
            <span aria-hidden="true">📌</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-amber-900">Pinned by the coaches</span>
              <span className="block truncate text-base">{snippet(pin.body)}</span>
            </span>
          </button>
        )}

        {!loaded && !posts.length && <Loading />}
        {loadError && (
          <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">
            Couldn&apos;t load Chatter: {loadError}
          </p>
        )}
        {hasOlder && (
          <button onClick={loadOlder} className={`${secondary} mb-3`}>
            Earlier posts
          </button>
        )}
        {loaded && !loadError && posts.length === 0 && (
          <p className="my-6 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-center text-lg">
            👋 Nobody&apos;s posted yet. Say hi to the team.
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
                team={team}
                quote={findPost(post.quotePostId)}
                onQuoteTap={jumpTo}
                onActions={() => setActionsFor(post)}
              />
            </li>
          ))}
        </ol>
        <div ref={bottom} className="h-2" />

        <Composer
          key={replyTo?.id ?? "new"}
          disabledReason={
            !paid
              ? "Posting in Chatter is a paid feature. A coach can renew the team on Coaches & parents."
              : mutedUntil
                ? `A coach paused your posting until ${new Date(mutedUntil).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`
                : null
          }
          offline={!online && loaded}
          replyTo={replyTo}
          replyAuthor={replyTo ? authorOf(replyTo.authorId, team).name : ""}
          onCancelReply={() => setReplyTo(null)}
          onSend={async (body) => {
            const m = await backend();
            const post = await m.sendPost(teamId, me, body, replyTo?.id ?? null);
            setPosts((prev) => mergePosts(prev, [post]));
            setReplyTo(null);
            scrollToEnd(true);
          }}
        />
      </div>

      <Sheet open={actionsFor !== null} title="Post" onClose={() => setActionsFor(null)}>
        {actionsFor && (
          <PostActions
            post={actionsFor}
            me={me}
            role={role}
            authorName={authorOf(actionsFor.authorId, team).name}
            authorPausable={
              moderator &&
              actionsFor.authorId !== null &&
              actionsFor.authorId !== me &&
              !authorOf(actionsFor.authorId, team).staff &&
              data.members.some((m) => m.userId === actionsFor.authorId)
            }
            authorPausedUntil={paused.find((p) => p.userId === actionsFor.authorId)?.until ?? null}
            pinned={pin?.id === actionsFor.id}
            onDone={() => setActionsFor(null)}
            onReply={() => {
              setReplyTo(actionsFor);
              setActionsFor(null);
            }}
            onEdit={() => {
              setEditing(actionsFor);
              setActionsFor(null);
            }}
            onReport={() => {
              setReporting(actionsFor);
              setActionsFor(null);
            }}
            refreshModeration={refreshModeration}
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
                mergePosts(prev, [{ ...editing, body, editedAt: new Date().toISOString() }]),
              );
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={reporting !== null} title="Report a post" onClose={() => setReporting(null)}>
        {reporting && (
          <ReportForm
            onSend={async (reason, note) => {
              await (await backend()).reportPost(reporting.id, reason, note);
              setReporting(null);
              toast("Thanks. The team's coaches will take a look.");
            }}
          />
        )}
      </Sheet>

      <Sheet open={showReports} title="Reported posts" onClose={() => setShowReports(false)}>
        <ReportsList
          reports={reports}
          findPost={findPost}
          authorName={(p) => authorOf(p.authorId, team).name}
          onChanged={async () => {
            await refreshModeration();
          }}
          onRemoved={(id) =>
            setPosts((prev) =>
              prev.map((p) =>
                p.id === id ? { ...p, body: "", removedAt: new Date().toISOString() } : p,
              ),
            )
          }
        />
      </Sheet>
    </AppShell>
  );
}

function Agree({ onAgree }: { onAgree: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5">
      <h2 className="text-2xl font-black">💬 Welcome to Chatter</h2>
      <p className="text-lg">
        Chatter is your team&apos;s chat, for the coaches and parents. Players don&apos;t have
        accounts, and there are no private messages: everything you post goes to the whole team.
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-6 text-base text-slate-700">
        <li>Keep it about the team, and keep it kind. Kids may be reading over your shoulder.</li>
        <li>Talk to a coach in person about playing time, not in Chatter.</li>
        <li>Coaches and managers can remove posts and pause posting.</li>
        <li>See something wrong? Tap ⋯ on the post and Report it.</li>
      </ul>
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button
        disabled={busy}
        className={primary}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onAgree();
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        I&apos;m 18 or older and agree
      </button>
    </div>
  );
}

function PostBubble({
  post,
  mine,
  grouped,
  team,
  quote,
  onQuoteTap,
  onActions,
}: {
  post: ChatterPost;
  mine: boolean;
  grouped: boolean;
  team: Parameters<typeof authorOf>[1];
  quote: ChatterPost | null;
  onQuoteTap: (id: string) => void;
  onActions: () => void;
}) {
  const author = authorOf(post.authorId, team);
  if (post.removedAt) {
    return (
      <p id={`post-${post.id}`} className="px-3 text-base text-slate-500 italic">
        Post removed
      </p>
    );
  }
  return (
    <div
      id={`post-${post.id}`}
      className={`flex flex-col gap-1 rounded-2xl p-3 transition-shadow ${mine ? "bg-[color-mix(in_srgb,var(--team)_10%,white)]" : "bg-white"} border border-slate-200`}
    >
      {!grouped && (
        <div className="flex items-baseline gap-2">
          <span className={`font-bold ${author.staff ? "text-[var(--team)]" : ""}`}>
            {author.name}
          </span>
          {author.role && author.role !== author.name && (
            <span className="text-sm text-slate-500">{author.role}</span>
          )}
          <span className="ml-auto shrink-0 text-sm text-slate-500">
            {timeLabel(post.createdAt)}
          </span>
        </div>
      )}
      {post.quotePostId && (
        <button
          onClick={() => quote && !quote.removedAt && onQuoteTap(quote.id)}
          className="rounded-xl border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-left"
        >
          {quote && !quote.removedAt ? (
            <>
              <span className="block text-sm font-bold">{authorOf(quote.authorId, team).name}</span>
              <span className="line-clamp-2 text-sm text-slate-600">
                {snippet(quote.body, 160)}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-500 italic">
              {quote ? "Original post was removed" : "Loading the original post…"}
            </span>
          )}
        </button>
      )}
      <div className="flex items-end gap-2">
        <p className="min-w-0 flex-1 text-lg break-words whitespace-pre-wrap">{post.body}</p>
        <button
          onClick={onActions}
          aria-label={`More for ${author.name}'s post`}
          className="-mr-1 -mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-slate-500 active:bg-slate-100"
        >
          ⋯
        </button>
      </div>
      {post.editedAt && <span className="text-xs text-slate-500">edited</span>}
    </div>
  );
}

function Composer({
  disabledReason,
  offline,
  replyTo,
  replyAuthor,
  onCancelReply,
  onSend,
}: {
  disabledReason: string | null;
  offline: boolean;
  replyTo: ChatterPost | null;
  replyAuthor: string;
  onCancelReply: () => void;
  onSend: (body: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (replyTo) input.current?.querySelector("textarea")?.focus();
  }, [replyTo]);

  if (disabledReason) {
    return (
      <div className="sticky bottom-0 mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base">
        🔒 {disabledReason}
      </div>
    );
  }
  const body = text.trim();
  const send = async () => {
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setText("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      ref={input}
      className="sticky bottom-0 -mx-4 mt-3 flex flex-col gap-2 border-t border-slate-200 bg-slate-100 lg:bg-slate-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mx-0 md:rounded-t-2xl md:border-x md:px-3"
    >
      {replyTo && (
        <div className="flex items-start gap-2 rounded-xl border-l-4 border-[var(--team)] bg-white px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Replying to {replyAuthor}</span>
            <span className="block truncate text-sm text-slate-600">{snippet(replyTo.body)}</span>
          </span>
          <button
            onClick={onCancelReply}
            aria-label="Cancel the reply"
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-500 active:bg-slate-100"
          >
            ×
          </button>
        </div>
      )}
      {offline && (
        <p className="text-sm font-bold text-amber-800">
          Reconnecting… new posts will show up when the signal&apos;s back.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 p-2 text-base text-red-900">{error}</p>}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <MicField multiline value={text} onChange={setText} maxLength={BODY_MAX}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              maxLength={BODY_MAX}
              rows={Math.min(5, Math.max(1, text.split("\n").length))}
              placeholder="Post to the team…"
              aria-label="Post to the team"
              className="block w-full resize-none rounded-xl border-2 border-slate-300 bg-white py-3 pr-12 pl-3 text-lg"
            />
          </MicField>
        </div>
        <button
          onClick={send}
          disabled={!body || busy}
          className="h-[52px] shrink-0 rounded-xl bg-[var(--team)] px-5 text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
        >
          {busy ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}

function PostActions({
  post,
  me,
  role,
  authorName,
  authorPausable,
  authorPausedUntil,
  pinned,
  onDone,
  onReply,
  onEdit,
  onReport,
  refreshModeration,
}: {
  post: ChatterPost;
  me: string;
  role: AppData["me"]["role"];
  authorName: string;
  authorPausable: boolean;
  authorPausedUntil: string | null;
  pinned: boolean;
  onDone: () => void;
  onReply: () => void;
  onEdit: () => void;
  onReport: () => void;
  refreshModeration: () => Promise<void>;
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
  const moderator = canModerate(role);
  return (
    <div className="flex flex-col gap-2">
      <p className="line-clamp-3 rounded-xl bg-slate-50 p-3 text-base text-slate-700">
        <b>{authorName}:</b> {snippet(post.body, 200)}
      </p>
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button className={primary} onClick={onReply}>
        ↩︎ Reply
      </button>
      <button
        className={secondary}
        onClick={() =>
          run(async () => {
            await navigator.clipboard.writeText(post.body);
          }, "Copied")
        }
      >
        Copy text
      </button>
      {canEdit(post, me) && (
        <button className={secondary} onClick={onEdit}>
          Edit
        </button>
      )}
      {moderator && (
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
      {authorPausable &&
        (authorPausedUntil ? (
          <button
            disabled={busy}
            className={secondary}
            onClick={() =>
              run(async () => {
                await (await backend()).pauseMember(post.teamId, post.authorId!, null);
                await refreshModeration();
              }, `${authorName} can post again`)
            }
          >
            Let {authorName} post again
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-slate-200 p-3">
            <p className="text-base font-bold">Pause {authorName}&apos;s posting</p>
            <div className="grid grid-cols-2 gap-2">
              {PAUSES.map((p) => (
                <button
                  key={p.label}
                  disabled={busy}
                  className={secondary}
                  onClick={() =>
                    run(async () => {
                      const until = new Date(Date.now() + p.hours * 3_600_000).toISOString();
                      await (await backend()).pauseMember(post.teamId, post.authorId!, until);
                      await refreshModeration();
                    }, `${authorName} is paused for ${p.label}`)
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      {post.authorId !== me && (
        <button className={secondary} onClick={onReport}>
          🚩 Report
        </button>
      )}
      {canRemove(post, me, role) && (
        <button
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-red-300 bg-white text-base font-bold text-red-700 active:bg-red-50"
          onClick={() => {
            if (!window.confirm("Remove this post for everyone?")) return;
            void run(async () => (await backend()).removePost(post.id), "Post removed");
          }}
        >
          Remove post
        </button>
      )}
    </div>
  );
}

function EditForm({
  post,
  onSave,
}: {
  post: ChatterPost;
  onSave: (body: string) => Promise<void>;
}) {
  const [text, setText] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <MicField multiline value={text} onChange={setText} maxLength={BODY_MAX}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={BODY_MAX}
          rows={5}
          aria-label="Your post"
          className="block w-full rounded-xl border-2 border-slate-300 p-3 pr-12 text-lg"
        />
      </MicField>
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button
        disabled={busy || !text.trim()}
        className={primary}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave(text.trim());
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        Save
      </button>
    </div>
  );
}

function ReportForm({ onSend }: { onSend: (reason: ReportReason, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-slate-700">
        Reports go to the team&apos;s coaches and managers.
      </p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="What's wrong">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.id}
            role="radio"
            aria-checked={reason === r.id}
            onClick={() => setReason(r.id)}
            className={`h-12 rounded-xl border-2 px-3 text-left text-base font-bold ${reason === r.id ? "border-[var(--team)] bg-[color-mix(in_srgb,var(--team)_10%,white)]" : "border-slate-300 bg-white"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {reason === "child_safety" && (
        <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">
          If a child is in danger right now, call 911.
        </p>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Anything to add (optional)"
        aria-label="Anything to add"
        className="block w-full rounded-xl border-2 border-slate-300 p-3 text-lg"
      />
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button
        disabled={!reason || busy}
        className={primary}
        onClick={async () => {
          if (!reason) return;
          setBusy(true);
          setError(null);
          try {
            await onSend(reason, note);
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        Send report
      </button>
    </div>
  );
}

function ReportsList({
  reports,
  findPost,
  authorName,
  onChanged,
  onRemoved,
}: {
  reports: ChatterReport[];
  findPost: (id: string) => ChatterPost | null;
  authorName: (p: ChatterPost) => string;
  onChanged: () => Promise<void>;
  onRemoved: (postId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!reports.length) return <p className="text-lg">No open reports. 👍</p>;
  const reasonLabel = (id: ReportReason) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      toast(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ul className="flex flex-col gap-3">
      {reports.map((r) => {
        const post = findPost(r.postId);
        return (
          <li key={r.id} className="flex flex-col gap-2 rounded-xl border-2 border-slate-200 p-3">
            <p className="text-sm font-bold text-red-800">🚩 {reasonLabel(r.reason)}</p>
            {r.note && <p className="text-base">“{r.note}”</p>}
            <p className="rounded-xl bg-slate-50 p-2 text-base">
              {post ? (
                post.removedAt ? (
                  <i>Already removed</i>
                ) : (
                  <>
                    <b>{authorName(post)}:</b> {snippet(post.body, 200)}
                  </>
                )
              ) : (
                <i>An older post</i>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {post && !post.removedAt && (
                <button
                  disabled={busy}
                  className="h-12 rounded-xl border-2 border-red-300 bg-white text-base font-bold text-red-700"
                  onClick={() =>
                    act(async () => {
                      const m = await backend();
                      await m.removePost(r.postId);
                      await m.resolveReport(r.id);
                      onRemoved(r.postId);
                    })
                  }
                >
                  Remove post
                </button>
              )}
              <button
                disabled={busy}
                className={secondary}
                onClick={() => act(async () => (await backend()).resolveReport(r.id))}
              >
                It&apos;s fine
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
