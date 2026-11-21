"use client";

// Club posts to teams' Chatter: write once, every picked team gets its own copy. Replies,
// reactions and votes stay inside each team; the club sees only totals.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BODY_MAX,
  PHOTOS_MAX,
  POLL_ENDS,
  POLL_OPTIONS_MAX,
  POLL_OPTION_MAX,
  checkPoll,
} from "@/lib/chatter/feed";
import type { ClubChatterPost, ClubTarget } from "@/lib/data/club-backend";
import { Loading } from "../AppShell";
import { picturesFrom, preparePhoto } from "../chatter/photo";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const GROUPME_MAX = 1000;
const backend = () => import("@/lib/data/club-backend");
const chatter = () => import("@/lib/data/chatter-backend");
const coaches = () => import("@/lib/data/club-coaches-backend");
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ClubChatterTab({ clubId }: { clubId: string }) {
  const [targets, setTargets] = useState<ClubTarget[] | null>(null);
  const [posts, setPosts] = useState<ClubChatterPost[]>([]);
  const [coachesGroup, setCoachesGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let current = true;
    void (async () => {
      const m = await backend();
      const [t, p, g] = await Promise.all([
        m.clubTargets(clubId),
        m.clubChatterPosts(clubId),
        m.clubGroupMe(clubId).catch(() => null),
      ]);
      if (!current) return;
      setTargets(t);
      setPosts(p);
      setCoachesGroup(!!g);
    })().catch((e: unknown) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [clubId, version]);

  if (!targets) return error ? <p className="text-base text-red-700">{error}</p> : <Loading />;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/club-coaches?club=${clubId}`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 border-[var(--team)] bg-white px-4 text-base font-bold text-[var(--team)]"
      >
        <span>💬 Open Club coaches, the club&apos;s chat with its coaches</span>
        <span aria-hidden="true">→</span>
      </Link>
      {targets.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-base">
          No teams hold this season&apos;s club code yet. Once a team enters its code, you can post
          to its Chatter here.
        </p>
      ) : (
        <Compose clubId={clubId} targets={targets} coachesGroup={coachesGroup} onSent={refresh} />
      )}
      <Sent posts={posts} onChange={refresh} />
    </div>
  );
}

function Compose({
  clubId,
  targets,
  coachesGroup,
  onSent,
}: {
  clubId: string;
  targets: ClubTarget[];
  /** The club's coaches GroupMe group is connected. */
  coachesGroup: boolean;
  onSent: () => void;
}) {
  const [toCoaches, setToCoaches] = useState(false);
  const [text, setText] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>(() => targets.map((t) => t.teamId));
  const [isPoll, setIsPoll] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [ends, setEnds] = useState<number | null>(null);
  const [alsoGroupMe, setAlsoGroupMe] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const all = teamIds.length === targets.length;
  const groupMeTeams = targets.filter((t) => t.connected && teamIds.includes(t.teamId));
  const choices = options.map((o) => o.trim()).filter(Boolean);
  const groupMeText = isPoll
    ? `📊 ${text.trim()}\n${choices.map((c) => `• ${c}`).join("\n")}\nVote in Fungo's Chatter.`
    : text.trim();
  const groupMeTooLong = alsoGroupMe && groupMeText.length > GROUPME_MAX;
  // GroupMe gets the words only; a photo-only post has none to send.
  // Club coaches takes posts, not polls (polls go to teams).
  const coachesOn = toCoaches && !isPoll;
  const coachesGroupMe = coachesOn && coachesGroup;
  const groupMeOk = (groupMeTeams.length > 0 || coachesGroupMe) && !!text.trim();
  const groupMeCount = groupMeTeams.length + (coachesGroupMe ? 1 : 0);
  const where = [
    coachesOn ? "Club coaches" : "",
    teamIds.length ? `${teamIds.length} team${teamIds.length === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const send = async () => {
    setError(null);
    setSent(null);
    if (isPoll) {
      const problem = checkPoll(text, options);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    const c = await chatter();
    const uploaded: Awaited<ReturnType<typeof c.uploadClubPhoto>>[] = [];
    try {
      // Teams' copies share one set of club photos (only needed when posting to teams).
      if (teamIds.length)
        for (const file of files)
          uploaded.push(await c.uploadClubPhoto(clubId, await preparePhoto(file)));
      const m = await backend();
      if (coachesOn) {
        const cc = await coaches();
        const me = await cc.myUserId();
        // The coaches feed keeps its photos in the poster's own folder there.
        const mine = [];
        for (const file of files)
          mine.push(await cc.uploadPhoto(clubId, me, await preparePhoto(file)));
        await cc.sendPost(clubId, me, text, null, mine);
      }
      if (teamIds.length)
        await m.sendClubChatterPost(
          clubId,
          teamIds,
          text,
          isPoll
            ? {
                options: choices,
                multi,
                anonymous,
                closesAt: ends ? new Date(Date.now() + ends * 3_600_000).toISOString() : null,
              }
            : undefined,
          uploaded,
        );
      let note = `Posted to ${where}.`;
      if (alsoGroupMe && groupMeOk) {
        try {
          const n = await m.clubPost(
            clubId,
            coachesGroupMe,
            groupMeTeams.map((t) => t.teamId),
            groupMeText,
          );
          note += ` Also sent to ${n} GroupMe group${n === 1 ? "" : "s"}.`;
        } catch (e) {
          note += ` GroupMe didn't go: ${errorText(e)}`;
        }
      }
      setSent(note);
      setText("");
      setOptions(["", ""]);
      setIsPoll(false);
      setFiles([]);
      onSent();
    } catch (e) {
      void c.deletePhotos(uploaded).catch(() => undefined);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className={heading}>Post to teams&apos; Chatter</h2>
      <p className="-mt-1 text-base text-slate-600">
        Write it once. Each team gets its own copy, marked as from the club. Families reply and
        react inside their own team; you see the totals below, never their conversations. Club posts
        can&apos;t be taken down by teams.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            [false, "📣 Post"],
            [true, "📊 Poll"],
          ] as const
        ).map(([poll, label]) => (
          <button
            key={label}
            onClick={() => setIsPoll(poll)}
            aria-pressed={isPoll === poll}
            className={`h-12 rounded-xl border-2 text-base font-bold ${isPoll === poll ? "border-[var(--team)] bg-[var(--team)] text-white" : "border-slate-300 bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSent(null);
        }}
        rows={isPoll ? 2 : 5}
        maxLength={BODY_MAX}
        aria-label={isPoll ? "Question" : "Message"}
        placeholder={
          isPoll
            ? "Can your family help at the fundraiser Saturday?"
            : "Tryouts for next season are July 12 at Chabills Field."
        }
        className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base focus:border-[var(--team)] focus:outline-none"
      />
      {!isPoll && (
        <div className="flex flex-wrap items-center gap-2">
          {previews.map((url, i) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
              <img src={url} alt="" className="size-20 rounded-lg object-cover" />
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-slate-800 text-base font-bold text-white"
              >
                ✕
              </button>
            </div>
          ))}
          {files.length < PHOTOS_MAX && (
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 text-base font-bold text-slate-600">
              📷 {files.length ? "Add another" : "Add a photo or PDF flyer"}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])];
                  e.target.value = "";
                  setSent(null);
                  setError(null);
                  const room = PHOTOS_MAX - files.length;
                  // A PDF's pages become pictures (a flyer, a schedule).
                  void picturesFrom(picked, room)
                    .then(({ pictures, leftOut }) => {
                      setFiles((prev) => [...prev, ...pictures].slice(0, PHOTOS_MAX));
                      if (leftOut > 0 || picked.length > room)
                        setError(
                          `Up to ${PHOTOS_MAX} photos or pages a post. The rest were left out.`,
                        );
                    })
                    .catch((err: unknown) => setError(errorText(err)));
                }}
              />
            </label>
          )}
        </div>
      )}
      {isPoll && (
        <div className="flex flex-col gap-2">
          {options.map((o, i) => (
            <input
              key={i}
              value={o}
              maxLength={POLL_OPTION_MAX}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Choice ${i + 1}`}
              aria-label={`Choice ${i + 1}`}
              className={field}
            />
          ))}
          {options.length < POLL_OPTIONS_MAX && (
            <button
              onClick={() => setOptions([...options, ""])}
              className="h-12 rounded-xl border-2 border-dashed border-slate-300 text-base font-bold text-slate-600"
            >
              + Add a choice
            </button>
          )}
          <Check label="People can pick more than one" checked={multi} onChange={setMulti} />
          <Check
            label="Anonymous (no names, even inside each team)"
            checked={anonymous}
            onChange={setAnonymous}
          />
          <label className="flex flex-col gap-1 text-base font-semibold">
            Closes
            <select
              value={ends ?? ""}
              onChange={(e) => setEnds(e.target.value ? Number(e.target.value) : null)}
              className={field}
            >
              {POLL_ENDS.map((p) => (
                <option key={p.label} value={p.hours ?? ""}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold">Send to</legend>
        <Check
          label={
            isPoll
              ? "Club coaches (posts only; polls go to teams)"
              : "Club coaches (the director and every team's coaches)"
          }
          checked={coachesOn}
          disabled={isPoll}
          onChange={setToCoaches}
        />
        <Check
          label={`All club teams (${targets.length})`}
          checked={all}
          onChange={(on) => setTeamIds(on ? targets.map((t) => t.teamId) : [])}
        />
        <details className="rounded-xl border-2 border-slate-200 bg-white px-3">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">
            Pick teams ({teamIds.length} picked)
          </summary>
          <div className="flex flex-col gap-1 pb-2">
            {targets.map((t) => (
              <Check
                key={t.teamId}
                label={`${t.name} (${t.ageGroup})`}
                checked={teamIds.includes(t.teamId)}
                onChange={(on) =>
                  setTeamIds(on ? [...teamIds, t.teamId] : teamIds.filter((x) => x !== t.teamId))
                }
              />
            ))}
          </div>
        </details>
        <Check
          label={`Also post to GroupMe (${groupMeCount} group${groupMeCount === 1 ? "" : "s"} connected)`}
          checked={alsoGroupMe && groupMeOk}
          disabled={!groupMeOk}
          onChange={setAlsoGroupMe}
        />
        {alsoGroupMe && groupMeOk && files.length > 0 && (
          <p className="text-sm text-slate-600">GroupMe gets the words; photos go to Chatter.</p>
        )}
        {groupMeTooLong && (
          <p className="text-sm font-semibold text-amber-800">
            GroupMe takes up to 1,000 characters; this is {groupMeText.length}. Shorten it or skip
            GroupMe.
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {sent && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
        >
          {sent}
        </p>
      )}
      <button
        onClick={() => void send()}
        disabled={
          (!text.trim() && (isPoll || files.length === 0)) ||
          (teamIds.length === 0 && !coachesOn) ||
          busy ||
          groupMeTooLong
        }
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
      >
        {busy ? "Posting…" : `Post${isPoll ? " the poll" : ""} to ${where || "…"}`}
      </button>
      <p className="text-sm text-slate-600">Up to 20 club posts an hour.</p>
    </section>
  );
}

function Sent({ posts, onChange }: { posts: ClubChatterPost[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const thumbs = posts.flatMap((p) => p.photos.map((ph) => ph.thumb)).join("|");
  useEffect(() => {
    if (!thumbs) return;
    let current = true;
    void chatter()
      .then((c) => c.photoUrls(thumbs.split("|")))
      .then((u) => current && setUrls(u))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [thumbs]);
  if (posts.length === 0) return null;
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 className={heading}>Sent</h2>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {posts.map((p) => {
          const open =
            p.kind === "poll" &&
            !p.removedAt &&
            !p.closedAt &&
            (!p.closesAt || new Date(p.closesAt) > new Date());
          const total = p.votes.reduce((a, b) => a + b, 0);
          return (
            <li
              key={p.id}
              className={`flex flex-col gap-2 rounded-xl border-2 border-slate-200 bg-white p-4 ${p.removedAt ? "opacity-60" : ""}`}
            >
              <p className="text-sm text-slate-500">
                {new Date(p.createdAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {" · "}
                {p.teams} team{p.teams === 1 ? "" : "s"}
                {p.removedAt ? " · Taken down" : ""}
              </p>
              {p.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.photos.map((ph) =>
                    urls[ph.thumb] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a private, signed link
                      <img
                        key={ph.thumb}
                        src={urls[ph.thumb]}
                        alt=""
                        className="size-20 rounded-lg object-cover"
                      />
                    ) : (
                      <span key={ph.thumb} className="size-20 rounded-lg bg-slate-100" />
                    ),
                  )}
                </div>
              )}
              {p.body && (
                <p className="text-base break-words whitespace-pre-wrap">
                  {p.kind === "poll" ? "📊 " : ""}
                  {p.body}
                </p>
              )}
              {p.kind === "poll" && (
                <div className="flex flex-col gap-1.5">
                  {p.options.map((o, i) => {
                    const n = p.votes[i] ?? 0;
                    const share = total ? n / total : 0;
                    return (
                      <div
                        key={i}
                        className="relative overflow-hidden rounded-lg bg-slate-100 px-3 py-2"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--team)_25%,white)]"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                        <div className="relative flex justify-between gap-2 text-base">
                          <span className="min-w-0 break-words">{o}</span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {n} · {Math.round(share * 100)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-sm text-slate-600">
                    {p.voters} {p.voters === 1 ? "person" : "people"} voted
                    {open ? "" : " · Closed"}
                  </p>
                </div>
              )}
              <p className="flex flex-wrap items-center gap-2 text-base text-slate-700">
                {p.reactions.map((r) => (
                  <span
                    key={r.emoji}
                    className="rounded-full border-2 border-slate-200 px-2.5 py-0.5"
                  >
                    {r.emoji} <b>{r.count}</b>
                  </span>
                ))}
                <span className="text-sm text-slate-600">
                  {p.replies} repl{p.replies === 1 ? "y" : "ies"} across teams
                </span>
              </p>
              {!p.removedAt && (
                <div className="flex flex-wrap gap-2">
                  {open && (
                    <button
                      disabled={busy === p.id}
                      onClick={() =>
                        void act(p.id, async () => (await backend()).closeClubChatterPoll(p.id))
                      }
                      className="h-11 rounded-lg border-2 border-slate-400 bg-white px-3 text-base font-bold"
                    >
                      Close the poll
                    </button>
                  )}
                  <button
                    disabled={busy === p.id}
                    onClick={() => {
                      if (!window.confirm("Take this post down from every team's Chatter?")) return;
                      void act(p.id, async () => {
                        await (await backend()).removeClubChatterPost(p.id);
                        await (await chatter()).deletePhotos(p.photos).catch(() => undefined);
                      });
                    }}
                    className="h-11 rounded-lg border-2 border-red-300 bg-white px-3 text-base font-bold text-red-700"
                  >
                    Take down everywhere
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-12 items-center gap-3 text-base ${disabled ? "text-slate-400" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0"
      />
      {label}
    </label>
  );
}
