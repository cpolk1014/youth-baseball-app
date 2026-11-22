"use client";

// Chatter: the team's own chat feed. Adults only (team members; kids have no accounts), no
// private messages, coaches and managers moderate. The database enforces all of it.
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BODY_MAX,
  PHOTOS_MAX,
  POLL_ENDS,
  POLL_OPTIONS_MAX,
  POLL_OPTION_MAX,
  checkPoll,
  clubInitials,
  myReactions,
  nextVote,
  oneEmoji,
  QUICK_REACTIONS,
  REACTIONS_PER_PERSON,
  reactorNames,
  toggleReaction,
  type Reaction,
  pollOpen,
  pollStatus,
  tally,
  PAUSES,
  REPORT_REASONS,
  authorOf,
  canEdit,
  canModerate,
  canRemove,
  feedItems,
  mergePosts,
  pinnedPost,
  previewText,
  timeLabel,
  type Author,
  authorFromPerson,
  type ChatterChannel,
  type ChatterPerson,
  type ChatterPhoto,
  type ChatterPoll,
  type PollChoice,
  type ChatterPost,
  type ReportReason,
} from "@/lib/chatter/feed";
import { logoUrl } from "@/lib/branding/logo";
import { badgeText, refreshUnread, useUnread } from "@/lib/chatter/unread";
import { switchTeam, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell, Loading } from "../AppShell";
import { MicField } from "../Dictate";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";
import type {
  ChatterReport,
  ChatterSettings,
  ChatterState,
  PhotoSetting,
} from "@/lib/data/chatter-backend";
import type { ChatterGif } from "@/lib/chatter/gif";
import {
  filterMentionables,
  insertMention,
  mentionQuery,
  mentionsIn,
  splitMentions,
  type Mentionable,
} from "@/lib/chatter/mentions";
import { GameDayPosts } from "../GameDayPosts";
import { GifPicker, GifView } from "./Gif";
import { picturesFrom, preparePhoto } from "./photo";
import { announce } from "@/lib/push/client";
import { NotifyBar } from "./NotifyBar";

const backend = () => import("@/lib/data/chatter-backend");
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const secondary =
  "flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100";

export function ChatterScreen() {
  const data = useAppData();
  // Team (with the club's admins when the team is in a club) or Parents (never the club).
  const [channel, setChannel] = useState<ChatterChannel>(channelFromUrl);
  // From a notification: open the team it's about (when it's one of mine).
  // Once per visit, so switching teams by hand afterwards isn't undone.
  const jumped = useRef(false);
  const wantTeam = data?.myTeams.some((t) => t.id === teamFromUrl()) ? teamFromUrl() : null;
  const currentTeam = data?.team.id;
  useEffect(() => {
    if (jumped.current || !wantTeam || !currentTeam) return;
    jumped.current = true;
    if (wantTeam !== currentTeam) switchTeam(wantTeam);
  }, [wantTeam, currentTeam]);
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
  return (
    <Chatter
      key={`${data.team.id}:${channel}`}
      data={data}
      me={data.me.userId}
      channel={channel}
      onChannel={setChannel}
    />
  );
}

/** No frame of its own (the club's team view already has one). */
function ClubFrame({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const channelFromUrl = (): ChatterChannel =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("channel") === "parents"
    ? "parents"
    : "team";

const teamFromUrl = () =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("team");

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/**
 * One channel of a team's Chatter. `clubView`: a club admin in the team's Team channel, inside
 * the club's view of the team (no app frame of its own, no team settings or reports).
 */
export function Chatter({
  data,
  me,
  channel = "team",
  onChannel,
  clubView = false,
}: {
  data: AppData;
  me: string;
  channel?: ChatterChannel;
  onChannel?: (c: ChatterChannel) => void;
  clubView?: boolean;
}) {
  const teamId = data.team.id;
  const role = data.me.role;
  // Club admins moderate the Team channel, which the club owns.
  const moderator = clubView || canModerate(role);
  const paid = data.plan ? data.plan.paid : true;
  const cacheKey = channel === "parents" ? `${teamId}:parents` : teamId;
  const [people, setPeople] = useState<Map<string, ChatterPerson>>(new Map());
  const unreadNow = useUnread();
  // In the club's view the page already has its frame; the feed just fills it.
  const Shell = clubView ? ClubFrame : AppShell;

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
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ChatterSettings>({ photos: "everyone", polls: "staff" });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ photos: ChatterPhoto[]; index: number } | null>(null);
  const [polls, setPolls] = useState<Record<string, ChatterPoll>>({});
  const [results, setResults] = useState<Record<string, PollChoice[]>>({});
  const pollsAsked = useRef<Set<string>>(new Set());
  const [askingPoll, setAskingPoll] = useState(false);
  const [reactingTo, setReactingTo] = useState<ChatterPost | null>(null);

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
    if (!moderator || clubView) return;
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
      const cached = m.readCache(cacheKey);
      if (cached.length) {
        setPosts(cached);
        scrollToEnd();
      }
      try {
        const [page, pin, mine] = await Promise.all([
          m.loadPosts(teamId, undefined, channel),
          m.loadPinned(teamId, channel),
          m.myState(teamId, me),
        ]);
        if (cancelled) return;
        setPosts(page);
        setHasOlder(page.length >= m.PAGE);
        setPinned(pin);
        setState(mine);
        setLoadError(null);
        if (mine.agreedAt) void m.markRead(teamId, channel).then(refreshUnread, () => undefined);
        void m
          .chatterPeople(teamId)
          .then((list) => setPeople(new Map(list.map((x) => [x.userId, x]))))
          .catch(() => undefined);
        scrollToEnd();
        void refreshModeration().catch(() => undefined);
        void m
          .chatterSettings(teamId)
          .then(setSettings)
          .catch(() => undefined);
      } catch (e) {
        if (!cancelled) setLoadError(cached.length ? null : message(e));
        if (!cancelled && !cached.length) setState(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
      stop = m.subscribe(
        teamId,
        (post) => {
          // Both channels come over one connection; this feed shows its own.
          if (post.channel !== channel) return;
          setPosts((prev) => mergePosts(prev, [post]));
          setPinned((prev) =>
            post.pinnedAt && !post.removedAt ? post : prev?.id === post.id ? null : prev,
          );
          if (nearBottom.current) scrollToEnd(true);
          if (document.visibilityState === "visible")
            void m.markRead(teamId, channel).then(refreshUnread, () => undefined);
          if (moderator) void refreshModeration().catch(() => undefined);
        },
        setOnline,
        (poll) => {
          setPolls((prev) => ({ ...prev, [poll.postId]: poll }));
          void m
            .pollResults([poll.postId])
            .then((r) => setResults((prev) => ({ ...prev, ...r })))
            .catch(() => undefined);
        },
      );
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [teamId, me, moderator, refreshModeration, channel, cacheKey]);

  // Keep the last posts on the device for the dugout.
  useEffect(() => {
    if (!loaded || !posts.length) return;
    void backend().then((m) => m.writeCache(cacheKey, posts));
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

  // Polls on screen and their results.
  useEffect(() => {
    const want = [...posts, ...Object.values(quoted)]
      .filter((p) => p.kind === "poll" && !p.removedAt && !pollsAsked.current.has(p.id))
      .map((p) => p.id);
    if (!want.length) return;
    for (const id of want) pollsAsked.current.add(id);
    void backend()
      .then(async (m) => {
        const [found, res] = await Promise.all([m.loadPolls(want), m.pollResults(want)]);
        setPolls((prev) => ({ ...prev, ...Object.fromEntries(found.map((p) => [p.postId, p])) }));
        setResults((prev) => ({ ...prev, ...res }));
      })
      .catch(() => {
        for (const id of want) pollsAsked.current.delete(id);
      });
  }, [posts, quoted]);

  const castVote = async (poll: ChatterPoll, tapped: number) => {
    const current = results[poll.postId] ?? [];
    const mine = current.flatMap((c, i) => (c?.mine ? [i] : []));
    const next = nextVote(poll, mine, tapped);
    // Show it right away; the server's count follows.
    setResults((prev) => ({
      ...prev,
      [poll.postId]: poll.options.map((_, i) => {
        const c = current[i] ?? { votes: 0, mine: false, voters: poll.anonymous ? null : [] };
        const was = mine.includes(i);
        const now = next.includes(i);
        return {
          votes: c.votes + (now ? 1 : 0) - (was ? 1 : 0),
          mine: now,
          voters:
            c.voters === null
              ? null
              : now && !was
                ? [...c.voters, me]
                : !now && was
                  ? c.voters.filter((v) => v !== me)
                  : c.voters,
        };
      }),
    }));
    const m = await backend();
    try {
      await m.vote(poll.postId, next);
    } catch (e) {
      toast(message(e));
    }
    const fresh = await m.pollResults([poll.postId]).catch(() => null);
    if (fresh) setResults((prev) => ({ ...prev, ...fresh }));
  };

  const reactTo = async (post: ChatterPost, emoji: string) => {
    const on = !myReactions(post.reactions, me).includes(emoji);
    if (on && myReactions(post.reactions, me).length >= REACTIONS_PER_PERSON) {
      toast(`Up to ${REACTIONS_PER_PERSON} emoji on a post. Tap one of yours to take it back.`);
      return;
    }
    // Show it right away; the post's live update brings the server's version.
    const show = (reactions: Reaction[]) =>
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, reactions } : p)));
    show(toggleReaction(post.reactions, emoji, me));
    const m = await backend();
    try {
      await m.react(post.id, emoji, on);
    } catch (e) {
      toast(message(e));
      show(post.reactions);
      const [fresh] = await m.loadPostsById([post.id]).catch(() => []);
      if (fresh) setPosts((prev) => mergePosts(prev, [fresh]));
    }
  };
  // Names from everyone who can post here (club admins too), else from the team's own data.
  const authorFor = (id: string | null) => {
    const person = id ? people.get(id) : undefined;
    return person ? authorFromPerson(person) : authorOf(id, team);
  };
  const clubAdminsHere = [...people.values()].some(
    (p) => p.role === "director" || p.role === "club_admin",
  );
  // Who can be tagged: the team's adults (not me), plus @coaches, and @everyone for staff.
  const mentionables: Mentionable[] = [
    { id: "coaches", label: "coaches", hint: "Every coach and manager" },
    ...(moderator ? [{ id: "everyone", label: "everyone", hint: "The whole team" }] : []),
    // Tags are for people on the team (not the club's admins).
    ...(people.size
      ? [...people.values()]
          .filter((x) => x.userId !== me && x.role !== "director" && x.role !== "club_admin")
          .map((x) => {
            const a = authorFromPerson(x);
            return { id: x.userId, label: a.name, hint: a.role ?? undefined };
          })
      : data.members
          .filter((x) => x.userId && x.userId !== me)
          .map((x) => {
            const a = authorOf(x.userId, team);
            return { id: x.userId!, label: a.name, hint: a.role ?? undefined };
          })
    ).filter((x) => x.label && x.label !== "Former member"),
  ];
  const nameOf = (id: string) => authorFor(id).name;

  // Links to the feed's thumbnails (the bucket is private; links last a few hours).
  useEffect(() => {
    const want = [
      ...new Set(
        [...posts, ...Object.values(quoted)].flatMap((p) => p.photos.map((ph) => ph.thumb)),
      ),
    ].filter((path) => !asked.current.has(path));
    if (!want.length) return;
    for (const path of want) asked.current.add(path);
    void backend()
      .then((m) => m.photoUrls(want))
      .then((found) => setUrls((prev) => ({ ...prev, ...found })))
      .catch(() => {
        for (const path of want) asked.current.delete(path);
      });
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
      const older = await m.loadPosts(teamId, first.createdAt, channel);
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
  const canReact = paid && !mutedUntil && online;

  if (loaded && state && !state.agreedAt) {
    return (
      <Shell title="Chatter" subtitle={data.team.name} tab="chatter">
        <Agree
          onAgree={async () => {
            const m = await backend();
            await m.agree(teamId);
            setState(await m.myState(teamId, me));
            scrollToEnd();
          }}
        />
      </Shell>
    );
  }

  const items = feedItems(posts);
  const pin = pinned ?? pinnedPost(posts);

  return (
    <Shell
      title="Chatter"
      subtitle={data.team.name}
      tab="chatter"
      action={
        moderator && !clubView ? (
          <button
            onClick={() => setShowSettings(true)}
            className="h-11 rounded-lg px-3 text-base font-bold active:bg-black/10"
          >
            Settings
          </button>
        ) : undefined
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col">
        {!clubView && (
          <div
            role="tablist"
            aria-label="Chatter channels"
            className="mb-3 grid grid-cols-2 gap-1 rounded-xl border-2 border-[var(--team)] p-1"
          >
            {(
              [
                ["team", "Team", unreadNow.chatter],
                ["parents", "Parents", unreadNow.parents],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                role="tab"
                aria-selected={channel === id}
                onClick={() => onChannel?.(id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-base font-bold ${
                  channel === id ? "bg-[var(--team)] text-white" : "text-[var(--team)]"
                }`}
              >
                {label}
                {n > 0 && channel !== id && (
                  <span className="rounded-full bg-[#DC143C] px-2 py-0.5 text-xs text-white">
                    {badgeText(n)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {channel === "team" && clubAdminsHere && (
          <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            🔒 The club&apos;s director and admins are in this channel. The Parents channel is just
            the team.
          </p>
        )}
        {channel === "parents" && (
          <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            🔒 Just the team: coaches, managers, the treasurer and families. The club doesn&apos;t
            see this channel.
          </p>
        )}
        <NotifyBar
          userId={me}
          scopeId={teamId}
          scopeName={channel === "parents" ? `${data.team.name} (Parents)` : data.team.name}
          category={channel === "parents" ? "parents" : "chatter"}
        />
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
              <span className="block truncate text-base">{previewText(pin)}</span>
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
                authorFor={authorFor}
                quote={findPost(post.quotePostId)}
                onQuoteTap={jumpTo}
                onActions={() => setActionsFor(post)}
                urls={urls}
                onPhoto={(index) => setViewer({ photos: post.photos, index })}
                poll={polls[post.id] ?? null}
                results={results[post.id]}
                onVote={(poll, i) => void castVote(poll, i)}
                me={me}
                nameOf={nameOf}
                canReact={canReact}
                onReact={(emoji) => void reactTo(post, emoji)}
                onAddReaction={() => setReactingTo(post)}
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
          canPostPhotos={settings.photos === "everyone" || moderator}
          onNewPoll={settings.polls === "everyone" || moderator ? () => setAskingPoll(true) : null}
          mentionables={mentionables}
          onSend={async (body, files, gif, mentions) => {
            const m = await backend();
            const uploaded: ChatterPhoto[] = [];
            try {
              for (const file of files) {
                uploaded.push(await m.uploadPhoto(teamId, me, await preparePhoto(file)));
              }
            } catch (e) {
              void m.deletePhotos(uploaded).catch(() => undefined);
              throw e;
            }
            let post: ChatterPost;
            try {
              post = await m.sendPost(
                teamId,
                me,
                body,
                replyTo?.id ?? null,
                uploaded,
                gif,
                mentions,
                channel,
              );
            } catch (e) {
              void m.deletePhotos(uploaded).catch(() => undefined);
              throw e;
            }
            setPosts((prev) => mergePosts(prev, [post]));
            announce("chatter", post.id);
            setReplyTo(null);
            scrollToEnd(true);
          }}
        />
      </div>

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
          <PostActions
            post={actionsFor}
            me={me}
            // Club admins moderate the Team channel like its coaches.
            role={clubView ? "coach" : role}
            authorName={actionsFor.club?.name ?? authorOf(actionsFor.authorId, team).name}
            authorPausable={
              moderator &&
              !clubView &&
              actionsFor.authorId !== null &&
              actionsFor.authorId !== me &&
              !authorOf(actionsFor.authorId, team).staff &&
              data.members.some((m) => m.userId === actionsFor.authorId)
            }
            authorPausedUntil={paused.find((p) => p.userId === actionsFor.authorId)?.until ?? null}
            pinned={pin?.id === actionsFor.id}
            canReport={!clubView}
            canReact={canReact}
            onReact={(emoji) => {
              void reactTo(actionsFor, emoji);
              setActionsFor(null);
            }}
            reactors={actionsFor.reactions.map((r) => ({
              emoji: r.emoji,
              names: reactorNames(r.userIds, me, nameOf),
            }))}
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
            openPoll={
              actionsFor.kind === "poll" &&
              !!polls[actionsFor.id] &&
              pollOpen(polls[actionsFor.id]!) &&
              !actionsFor.club &&
              (actionsFor.authorId === me || moderator)
            }
            onClosePoll={async () => {
              await (await backend()).closePoll(actionsFor.id);
              setPolls((prev) => ({
                ...prev,
                [actionsFor.id]: { ...prev[actionsFor.id]!, closedAt: new Date().toISOString() },
              }));
            }}
          />
        )}
      </Sheet>

      <Sheet open={askingPoll} title="New poll" onClose={() => setAskingPoll(false)}>
        {askingPoll && (
          <PollForm
            onSend={async (question, options, multi, anonymous, closesAt) => {
              const m = await backend();
              const id = await m.createPoll(
                teamId,
                question,
                options,
                multi,
                anonymous,
                closesAt,
                channel,
              );
              announce("chatter", id);
              const [found] = await m.loadPostsById([id]);
              if (found) setPosts((prev) => mergePosts(prev, [found]));
              setAskingPoll(false);
              scrollToEnd(true);
            }}
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

      <Sheet open={showSettings} title="Chatter settings" onClose={() => setShowSettings(false)}>
        <Settings
          value={settings}
          onChange={async (key, v) => {
            await (await backend()).setChatterSetting(teamId, key, v);
            setSettings((prev) => ({ ...prev, [key]: v }));
            const what = key === "photos" ? "post photos" : "start polls";
            toast(v === "staff" ? `Only coaches and managers ${what}` : `Everyone can ${what}`);
          }}
        />
        {/* The automatic game day post goes into this Chatter, from Fungo. */}
        <div className="mt-6">
          <GameDayPosts team={data.team} />
        </div>
      </Sheet>

      {viewer && (
        <PhotoViewer
          photos={viewer.photos}
          start={viewer.index}
          thumbs={urls}
          onClose={() => setViewer(null)}
        />
      )}

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
                p.id === id
                  ? { ...p, body: "", photos: [], removedAt: new Date().toISOString() }
                  : p,
              ),
            )
          }
        />
      </Sheet>
    </Shell>
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

export function PostBubble({
  post,
  mine,
  grouped,
  authorFor,
  quote,
  onQuoteTap,
  onActions,
  urls,
  onPhoto,
  poll,
  results,
  onVote,
  me,
  nameOf,
  canReact,
  onReact,
  onAddReaction,
}: {
  post: ChatterPost;
  mine: boolean;
  grouped: boolean;
  /** Who wrote a post, as this feed knows them. */
  authorFor: (authorId: string | null) => Author;
  quote: ChatterPost | null;
  onQuoteTap: (id: string) => void;
  onActions: () => void;
  urls: Record<string, string>;
  onPhoto: (index: number) => void;
  poll: ChatterPoll | null;
  results: PollChoice[] | undefined;
  onVote: (poll: ChatterPoll, choice: number) => void;
  me: string;
  nameOf: (userId: string) => string;
  canReact: boolean;
  onReact: (emoji: string) => void;
  onAddReaction: () => void;
}) {
  const club = post.club;
  const author = club
    ? { name: club.name, role: "Club", staff: true }
    : post.fromFungo
      ? { name: "Fungo", role: "Game day", staff: true }
      : authorFor(post.authorId);
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
      style={club ? { ["--club" as string]: club.color ?? "#1B2A4A" } : undefined}
      className={`flex flex-col gap-1 rounded-2xl p-3 transition-shadow ${club ? "border-2 border-l-8 border-[var(--club)] bg-[color-mix(in_srgb,var(--club)_7%,white)]" : `${mine ? "bg-[color-mix(in_srgb,var(--team)_10%,white)]" : "bg-white"} border border-slate-200`}`}
    >
      {club && (
        <div className="flex items-center gap-2">
          {club.logo && logoUrl(club.logo) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(club.logo)!}
              alt=""
              className="size-9 shrink-0 rounded-lg bg-white object-contain"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--club)] text-sm font-black text-white">
              {clubInitials(club.name)}
            </span>
          )}
          <span className="min-w-0 truncate font-bold">{club.name}</span>
          <span className="shrink-0 rounded-full bg-[var(--club)] px-2 py-0.5 text-xs font-black tracking-wide text-white uppercase">
            Club
          </span>
          <span className="ml-auto shrink-0 text-sm text-slate-500">
            {timeLabel(post.createdAt)}
          </span>
        </div>
      )}
      {!grouped && !club && (
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
              <span className="block text-sm font-bold">{authorFor(quote.authorId).name}</span>
              <span className="line-clamp-2 text-sm text-slate-600">{previewText(quote, 160)}</span>
            </>
          ) : (
            <span className="text-sm text-slate-500 italic">
              {quote ? "Original post was removed" : "Loading the original post…"}
            </span>
          )}
        </button>
      )}
      {post.photos.length > 0 && <PhotoGrid photos={post.photos} urls={urls} onPhoto={onPhoto} />}
      {post.gif && <GifView gif={post.gif} />}
      <div className="flex items-end gap-2">
        {post.kind === "poll" ? (
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold break-words whitespace-pre-wrap">📊 {post.body}</p>
            {poll ? (
              <PollCard poll={poll} results={results} authorFor={authorFor} onVote={onVote} />
            ) : (
              <p className="text-base text-slate-500">Loading the poll…</p>
            )}
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-lg break-words whitespace-pre-wrap">
            {post.mentions.length
              ? splitMentions(
                  post.body,
                  post.mentions.map((id) => ({
                    id,
                    label: id === "coaches" || id === "everyone" ? id : nameOf(id),
                  })),
                ).map((part, i) =>
                  part.tag ? (
                    <span
                      key={i}
                      className={`rounded px-0.5 font-semibold ${
                        part.tag === me || part.tag === "everyone"
                          ? "bg-[color-mix(in_srgb,var(--team)_22%,white)] text-[var(--team)]"
                          : "text-[var(--team)]"
                      }`}
                    >
                      {part.text}
                    </span>
                  ) : (
                    <Fragment key={i}>{part.text}</Fragment>
                  ),
                )
              : post.body}
          </p>
        )}
        <button
          onClick={onActions}
          aria-label={`More for ${author.name}'s post`}
          className="-mr-1 -mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-slate-500 active:bg-slate-100"
        >
          ⋯
        </button>
      </div>
      {post.editedAt && <span className="text-xs text-slate-500">edited</span>}
      {(post.reactions.length > 0 || canReact) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {post.reactions.map((r) => {
            const tapped = r.userIds.includes(me);
            const who = reactorNames(r.userIds, me, nameOf);
            return (
              <button
                key={r.emoji}
                onClick={() => canReact && onReact(r.emoji)}
                disabled={!canReact}
                title={who}
                aria-label={`${r.emoji} ${r.userIds.length}: ${who}${canReact ? (tapped ? ". Tap to take yours back" : ". Tap to add yours") : ""}`}
                aria-pressed={tapped}
                className={`flex h-10 items-center gap-1 rounded-full border-2 px-3 text-lg leading-none disabled:opacity-100 ${tapped ? "border-[var(--team)] bg-[color-mix(in_srgb,var(--team)_12%,white)]" : "border-slate-200 bg-white active:bg-slate-100"}`}
              >
                <span>{r.emoji}</span>
                <span className="text-base font-bold text-slate-700">{r.userIds.length}</span>
              </button>
            );
          })}
          {canReact && (
            <button
              onClick={onAddReaction}
              aria-label="Add a reaction"
              className="flex h-10 items-center rounded-full border-2 border-dashed border-slate-300 px-3 text-lg leading-none text-slate-500 active:bg-slate-100"
            >
              ☺<span className="ml-0.5 text-base font-bold">+</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Tap a common emoji, or pick any emoji from the phone's emoji keyboard. */
export function ReactionPicker({
  mine,
  onPick,
}: {
  mine: string[];
  onPick: (emoji: string) => void;
}) {
  const [any, setAny] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pick = (text: string) => {
    const emoji = oneEmoji(text);
    if (emoji) onPick(emoji);
    else setError("That isn't one emoji. Tap the 😀 key on your keyboard and pick one.");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-6 gap-2">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            aria-pressed={mine.includes(e)}
            className={`flex h-14 items-center justify-center rounded-xl border-2 text-3xl ${mine.includes(e) ? "border-[var(--team)] bg-[color-mix(in_srgb,var(--team)_12%,white)]" : "border-slate-200 bg-white active:bg-slate-100"}`}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          pick(any);
        }}
      >
        <input
          value={any}
          onChange={(ev) => {
            setError(null);
            const v = ev.target.value;
            setAny(v);
            // Picking from the emoji keyboard sends it straight away.
            if (oneEmoji(v)) onPick(oneEmoji(v)!);
          }}
          aria-label="Any emoji"
          placeholder="Any emoji: tap 😀 on your keyboard"
          enterKeyHint="send"
          autoComplete="off"
          className="h-14 min-w-0 flex-1 rounded-xl border-2 border-slate-300 px-3 text-xl"
        />
      </form>
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      {mine.length > 0 && (
        <p className="text-sm text-slate-500">
          Yours: {mine.join(" ")}. Tap one again to take it back (up to {REACTIONS_PER_PERSON} on a
          post).
        </p>
      )}
    </div>
  );
}

export function Composer({
  disabledReason,
  offline,
  replyTo,
  replyAuthor,
  onCancelReply,
  canPostPhotos,
  onNewPoll,
  onSend,
  placeholder = "Post to the team…",
  mentionables = [],
}: {
  placeholder?: string;
  disabledReason: string | null;
  offline: boolean;
  replyTo: ChatterPost | null;
  replyAuthor: string;
  onCancelReply: () => void;
  canPostPhotos: boolean;
  /** Null when this person can't start polls on the team. */
  onNewPoll: (() => void) | null;
  onSend: (
    body: string,
    photos: File[],
    gif: ChatterGif | null,
    mentions: string[],
  ) => Promise<void>;
  /** People (and groups) a post can tag; none = no @ suggestions. */
  mentionables?: Mentionable[];
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const picker = useRef<HTMLInputElement>(null);
  // The box grows with what's typed (up to about 40% of the screen), then scrolls.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [text]);
  const [gif, setGif] = useState<ChatterGif | null>(null);
  // Tags: the @word being typed, and the people picked so far.
  const [tagAt, setTagAt] = useState<{ start: number; query: string } | null>(null);
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const suggestions =
    tagAt && mentionables.length ? filterMentionables(mentionables, tagAt.query) : [];
  const pickTag = (m: Mentionable) => {
    if (!tagAt) return;
    const next = insertMention(text, tagAt, m.label);
    setText(next.text);
    setPicked((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    setTagAt(null);
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };
  const [pickingGif, setPickingGif] = useState(false);
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
    if ((!body && !files.length && !gif) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body, files, gif, mentionsIn(body, picked));
      setText("");
      setFiles([]);
      setGif(null);
      setPicked([]);
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
            <span className="block truncate text-sm text-slate-600">{previewText(replyTo)}</span>
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
      {files.length > 0 && (
        <ul className="flex gap-2" aria-label="Photos to post">
          {previews.map((url, i) => (
            <li key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
              <img src={url} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-lg text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {gif && (
        <div className="relative w-fit">
          <GifView gif={gif} />
          <button
            onClick={() => setGif(null)}
            aria-label="Remove the GIF"
            className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-lg text-white"
          >
            ×
          </button>
        </div>
      )}
      <Sheet open={pickingGif} title="GIFs" onClose={() => setPickingGif(false)}>
        {pickingGif && (
          <GifPicker
            onPick={(g) => {
              setGif(g);
              setPickingGif(false);
            }}
          />
        )}
      </Sheet>
      {suggestions.length > 0 && (
        <ul
          className="flex flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-white"
          aria-label="Tag someone"
        >
          {suggestions.map((m) => (
            <li key={m.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickTag(m)}
                className="flex min-h-12 w-full items-baseline gap-2 px-3 text-left active:bg-slate-100"
              >
                <span className="font-bold">@{m.label}</span>
                {m.hint && <span className="truncate text-sm text-slate-500">{m.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="min-w-0">
        <MicField multiline value={text} onChange={setText} maxLength={BODY_MAX}>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTagAt(
                mentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            maxLength={BODY_MAX}
            ref={field}
            rows={1}
            placeholder={placeholder}
            aria-label={placeholder.replace(/…$/, "")}
            className="block max-h-[40vh] min-h-[52px] w-full resize-none overflow-y-auto rounded-xl border-2 border-slate-300 bg-white py-3 pr-12 pl-3 text-lg"
          />
        </MicField>
      </div>
      <div className="flex items-center gap-2">
        {onNewPoll && (
          <button
            onClick={onNewPoll}
            disabled={busy}
            aria-label="Ask the team a poll"
            className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl active:bg-slate-100 disabled:opacity-40"
          >
            📊
          </button>
        )}
        {canPostPhotos && (
          <>
            <input
              ref={picker}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).filter(
                  (f) => f.type.startsWith("image/") || /pdf$/i.test(f.type || f.name),
                );
                e.target.value = "";
                const room = PHOTOS_MAX - files.length;
                // A PDF's pages become pictures (a flyer, a schedule).
                void picturesFrom(picked, room)
                  .then(({ pictures, leftOut }) => {
                    if (leftOut > 0 || picked.length > room)
                      toast(`Up to ${PHOTOS_MAX} photos or pages a post`);
                    setFiles((prev) => [...prev, ...pictures].slice(0, PHOTOS_MAX));
                  })
                  .catch((err: unknown) => toast(message(err)));
              }}
            />
            <button
              onClick={() => picker.current?.click()}
              disabled={busy || files.length >= PHOTOS_MAX || !!gif}
              aria-label="Add photos"
              className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl active:bg-slate-100 disabled:opacity-40"
            >
              📷
            </button>
          </>
        )}
        <button
          onClick={() => setPickingGif(true)}
          disabled={busy || files.length > 0}
          aria-label="Add a GIF"
          className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-sm font-black active:bg-slate-100 disabled:opacity-40"
        >
          GIF
        </button>
        <span className="flex-1" />
        <button
          onClick={send}
          disabled={(!body && !files.length && !gif) || busy}
          className="h-[52px] shrink-0 rounded-xl bg-[var(--team)] px-5 text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
        >
          {busy ? (files.length ? "Sending…" : "…") : "Post"}
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
  openPoll,
  onClosePoll,
  canReact,
  onReact,
  reactors,
  canReport = true,
}: {
  canReport?: boolean;
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
  openPoll: boolean;
  onClosePoll: () => Promise<void>;
  canReact: boolean;
  onReact: (emoji: string) => void;
  reactors: { emoji: string; names: string }[];
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
        onClick={() =>
          run(async () => {
            await navigator.clipboard.writeText(post.body);
          }, "Copied")
        }
      >
        Copy text
      </button>
      {openPoll && (
        <button
          disabled={busy}
          className={secondary}
          onClick={() => run(onClosePoll, "Poll closed")}
        >
          Close the poll
        </button>
      )}
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
      {canReport && post.authorId !== me && !post.club && (
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
            void run(async () => {
              const m = await backend();
              await m.removePost(post.id);
              await m.deletePhotos(post.photos).catch(() => undefined);
            }, "Post removed");
          }}
        >
          Remove post
        </button>
      )}
    </div>
  );
}

export function EditForm({
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
                    <b>{authorName(post)}:</b> {previewText(post, 200)}
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
                      await m.deletePhotos(post.photos).catch(() => undefined);
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

function PhotoGrid({
  photos,
  urls,
  onPhoto,
}: {
  photos: ChatterPhoto[];
  urls: Record<string, string>;
  onPhoto: (index: number) => void;
}) {
  const one = photos.length === 1;
  return (
    <div className={one ? "" : "grid grid-cols-2 gap-1"}>
      {photos.map((ph, i) => {
        const url = urls[ph.thumb];
        const ratio = one && ph.w && ph.h ? Math.min(Math.max(ph.w / ph.h, 0.75), 1.8) : 1;
        return (
          <button
            key={ph.thumb}
            onClick={() => onPhoto(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
            className={`block w-full overflow-hidden rounded-xl bg-slate-200 ${one ? "max-w-md" : ""}`}
            style={{ aspectRatio: String(ratio) }}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, signed links
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-3xl text-slate-400">
                📷
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Full-screen photos: swipe or arrows between them, Save to the phone. */
export function PhotoViewer({
  photos,
  start,
  thumbs,
  onClose,
}: {
  photos: ChatterPhoto[];
  start: number;
  thumbs: Record<string, string>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [full, setFull] = useState<Record<string, string>>({});
  const touch = useRef<number | null>(null);
  const photo = photos[index]!;
  const go = useCallback(
    (step: number) => setIndex((i) => Math.min(photos.length - 1, Math.max(0, i + step))),
    [photos.length],
  );

  useEffect(() => {
    void backend()
      .then((m) => m.photoUrls(photos.map((p) => p.path)))
      .then(setFull)
      .catch(() => undefined);
  }, [photos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  const src = full[photo.path] ?? thumbs[photo.thumb];
  const save = async () => {
    const url = full[photo.path];
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `chatter-photo-${index + 1}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        toast("Couldn't save the photo.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const startX = touch.current;
        const endX = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (startX == null || endX == null || Math.abs(endX - startX) < 50) return;
        go(endX < startX ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          className="h-12 rounded-xl px-4 text-lg font-bold active:bg-white/10"
        >
          ✕ Close
        </button>
        <span className="flex-1 text-center text-base">
          {photos.length > 1 ? `${index + 1} of ${photos.length}` : ""}
        </span>
        <button
          onClick={save}
          disabled={!full[photo.path]}
          className="h-12 rounded-xl px-4 text-lg font-bold active:bg-white/10 disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed links
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-lg">Loading…</span>
        )}
        {index > 0 && (
          <button
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-2 hidden h-14 w-14 items-center justify-center rounded-full bg-white/15 text-3xl md:flex"
          >
            ‹
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-2 hidden h-14 w-14 items-center justify-center rounded-full bg-white/15 text-3xl md:flex"
          >
            ›
          </button>
        )}
      </div>
      <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}

function Settings({
  value,
  onChange,
}: {
  value: ChatterSettings;
  onChange: (key: keyof ChatterSettings, v: PhotoSetting) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <SettingChoice
        title="Who can post photos"
        value={value.photos}
        onChange={(v) => onChange("photos", v)}
        hints={{ everyone: "Coaches and parents post photos", staff: "Parents post words only" }}
        note="Photos are shrunk on the phone and their location is removed before they upload. Only people on this team can open them."
      />
      <SettingChoice
        title="Who can start polls"
        value={value.polls}
        onChange={(v) => onChange("polls", v)}
        hints={{
          everyone: "Parents can ask too (carpools, team dinners)",
          staff: "Parents vote but don't start polls",
        }}
        note="Everyone on the team can always vote."
      />
    </div>
  );
}

function SettingChoice({
  title,
  value,
  onChange,
  hints,
  note,
}: {
  title: string;
  value: PhotoSetting;
  onChange: (v: PhotoSetting) => Promise<void>;
  hints: Record<PhotoSetting, string>;
  note: string;
}) {
  const [busy, setBusy] = useState(false);
  const options: { id: PhotoSetting; label: string }[] = [
    { id: "everyone", label: "Everyone" },
    { id: "staff", label: "Coaches and managers" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-bold">{title}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={value === o.id}
            disabled={busy}
            onClick={async () => {
              if (o.id === value) return;
              setBusy(true);
              try {
                await onChange(o.id);
              } catch (e) {
                toast(message(e));
              } finally {
                setBusy(false);
              }
            }}
            className={`rounded-xl border-2 p-3 text-left ${value === o.id ? "border-[var(--team)] bg-[color-mix(in_srgb,var(--team)_10%,white)]" : "border-slate-300 bg-white"}`}
          >
            <span className="block text-lg font-bold">{o.label}</span>
            <span className="block text-base text-slate-600">{hints[o.id]}</span>
          </button>
        ))}
      </div>
      <p className="text-base text-slate-600">{note}</p>
    </div>
  );
}

function PollCard({
  poll,
  results,
  authorFor,
  onVote,
}: {
  poll: ChatterPoll;
  results: PollChoice[] | undefined;
  authorFor: (authorId: string | null) => Author;
  onVote: (poll: ChatterPoll, choice: number) => void;
}) {
  const open = pollOpen(poll);
  const t = tally(poll, results);
  const status = pollStatus(poll);
  const names = (ids: string[]) => {
    const all = ids.map((id) => authorFor(id).name);
    return all.length > 3 ? `${all.slice(0, 3).join(", ")} +${all.length - 3}` : all.join(", ");
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      {poll.multi && open && <p className="text-sm text-slate-600">Pick as many as you like.</p>}
      <ul className="flex flex-col gap-2">
        {t.choices.map((c, i) => (
          <li key={i}>
            <button
              onClick={() => open && onVote(poll, i)}
              disabled={!open}
              aria-pressed={c.mine}
              className={`relative flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-xl border-2 px-3 py-2 text-left ${c.mine ? "border-[var(--team)]" : "border-slate-300"} bg-white disabled:cursor-default`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 ${c.mine ? "bg-[color-mix(in_srgb,var(--team)_22%,white)]" : "bg-slate-100"}`}
                style={{ width: `${Math.round(c.share * 100)}%` }}
              />
              <span className="relative flex-1 text-base font-bold break-words">
                {c.mine && "✓ "}
                {c.label}
                {!open && c.leading && " 🏆"}
              </span>
              <span className="relative shrink-0 text-base font-bold tabular-nums">
                {c.votes > 0 ? `${Math.round(c.share * 100)}%` : ""}
              </span>
            </button>
            {c.voters && c.voters.length > 0 && (
              <p className="mt-0.5 px-1 text-sm text-slate-500">{names(c.voters)}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        {t.voters === 1 ? "1 vote" : `${t.voters} votes`}
        {poll.anonymous ? " · Anonymous" : ""}
        {status ? ` · ${status}` : ""}
        {open && !t.choices.some((c) => c.mine) ? " · Tap to vote" : ""}
      </p>
    </div>
  );
}

function PollForm({
  onSend,
}: {
  onSend: (
    question: string,
    options: string[],
    multi: boolean,
    anonymous: boolean,
    closesAt: string | null,
  ) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [ends, setEnds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, hint: string) => (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className="flex items-center gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 text-left"
    >
      <span
        aria-hidden="true"
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${on ? "bg-[var(--team)]" : "bg-slate-300"}`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`}
        />
      </span>
      <span>
        <span className="block text-base font-bold">{label}</span>
        <span className="block text-sm text-slate-600">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <MicField multiline value={question} onChange={setQuestion} maxLength={BODY_MAX}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={BODY_MAX}
          rows={2}
          placeholder="Ask the team… (Who can make Saturday?)"
          aria-label="Question"
          className="block w-full rounded-xl border-2 border-slate-300 p-3 pr-12 text-lg"
        />
      </MicField>
      <ol className="flex flex-col gap-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={o}
              onChange={(e) =>
                setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
              }
              maxLength={POLL_OPTION_MAX}
              placeholder={`Choice ${i + 1}`}
              aria-label={`Choice ${i + 1}`}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 px-3 text-lg"
            />
            {options.length > 2 && (
              <button
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove choice ${i + 1}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl text-slate-500 active:bg-slate-100"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {options.length < POLL_OPTIONS_MAX && (
        <button className={secondary} onClick={() => setOptions((prev) => [...prev, ""])}>
          + Add a choice
        </button>
      )}
      {toggle(multi, setMulti, "Let people pick more than one", "Like: which days work for you?")}
      {toggle(anonymous, setAnonymous, "Anonymous", "Show the counts, not who voted")}
      <label className="flex flex-col gap-1">
        <span className="text-base font-bold">Closes</span>
        <select
          value={ends ?? ""}
          onChange={(e) => setEnds(e.target.value ? Number(e.target.value) : null)}
          className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        >
          {POLL_ENDS.map((e) => (
            <option key={e.label} value={e.hours ?? ""}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <button
        disabled={busy}
        className={primary}
        onClick={async () => {
          const problem = checkPoll(question, options);
          if (problem) {
            setError(problem);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onSend(
              question.trim(),
              options.map((o) => o.trim()).filter(Boolean),
              multi,
              anonymous,
              ends ? new Date(Date.now() + ends * 3_600_000).toISOString() : null,
            );
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        📊 Post the poll
      </button>
    </div>
  );
}
