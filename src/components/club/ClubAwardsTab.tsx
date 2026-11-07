"use client";

// Club awards: the director makes the season's awards (Team MVP…), makes them live with a
// due date, and watches picks come in. Picks stay private for the club's awards show.
import { useCallback, useEffect, useState } from "react";
import { seasonFor } from "@/lib/billing/season";
import {
  AWARD_PRESETS,
  boardDue,
  cellState,
  dueText,
  liveMessage,
  reminderMessage,
  showList,
  summarizeBoard,
  type BoardRow,
  type BoardSummary,
  type ClubAward,
} from "@/lib/club/awards";
import { Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { useToday } from "../useToday";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const secondary =
  "flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-bold active:bg-slate-100 disabled:opacity-40";
type AwardsApi = Pick<
  typeof import("@/lib/data/club-backend"),
  | "clubAwards"
  | "clubAwardBoard"
  | "clubGroupMe"
  | "saveClubAward"
  | "deleteClubAward"
  | "makeAwardsLive"
  | "setAwardsDue"
  | "clubPost"
>;
const realApi = (): Promise<AwardsApi> => import("@/lib/data/club-backend");

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface Draft {
  id?: string;
  name: string;
  emoji: string;
  description: string;
}

export function ClubAwardsTab({
  clubId,
  clubName,
  api = realApi,
}: {
  clubId: string;
  clubName: string;
  /** The data functions (tests pass their own). */
  api?: () => Promise<AwardsApi>;
}) {
  const backend = api;
  const today = useToday();
  // Empty until the page knows today's date (it isn't known while the page is built).
  const season = today ? seasonFor(new Date(`${today}T12:00:00`)) : "";
  const [awards, setAwards] = useState<ClubAward[] | null>(null);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [groupMe, setGroupMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [goLive, setGoLive] = useState(false);
  const [remind, setRemind] = useState(false);
  const [showing, setShowing] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!season) return;
    let current = true;
    void (async () => {
      const m = await backend();
      const [a, b, g] = await Promise.all([
        m.clubAwards(clubId, season),
        m.clubAwardBoard(clubId, season),
        m.clubGroupMe(clubId),
      ]);
      if (!current) return;
      setAwards(a);
      setBoard(b);
      setGroupMe(!!g);
    })().catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [clubId, season, version, backend]);

  if (!awards) return error ? <p className="text-base text-red-700">{error}</p> : <Loading />;

  const drafts = awards.filter((a) => !a.liveAt);
  const summary = summarizeBoard(awards, board);
  const due = boardDue(awards);
  const presets = AWARD_PRESETS.filter((p) => !awards.some((a) => a.name === p.name));

  const save = async (d: Draft) => {
    setBusy(true);
    setError(null);
    try {
      await (
        await backend()
      ).saveClubAward(clubId, {
        id: d.id,
        season,
        name: d.name,
        emoji: d.emoji,
        description: d.description,
        sort: d.id ? (awards.find((a) => a.id === d.id)?.sort ?? 0) : awards.length,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: ClubAward) => {
    const picks = summary.byAward.find((x) => x.award.id === a.id)?.picked ?? 0;
    if (
      !window.confirm(
        picks > 0
          ? `Delete ${a.name}? The ${picks} pick${picks === 1 ? "" : "s"} coaches made go with it.`
          : `Delete ${a.name}?`,
      )
    )
      return;
    try {
      await (await backend()).deleteClubAward(a.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base text-slate-700">
        Make your season awards, then tap Make live. Each team&apos;s coaches pick a winner from
        their To do, and only your club sees the picks, so they stay a surprise for the awards show.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {summary.live.length > 0 && (
        <Board
          summary={summary}
          due={due}
          today={today}
          groupMe={groupMe}
          onRemind={() => setRemind(true)}
          onShow={() => setShowing(true)}
          onDue={async (d) => {
            await (await backend()).setAwardsDue(clubId, season, d);
            reload();
          }}
        />
      )}

      <section>
        <h2 className={heading}>Awards · {season}</h2>
        {awards.length === 0 && (
          <p className="mb-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
            No awards yet. Tap a quick pick below or make your own.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {awards.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3"
            >
              <span aria-hidden="true" className="text-3xl">
                {a.emoji || "🏅"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                  {a.name}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black uppercase ${a.liveAt ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
                  >
                    {a.liveAt ? "Live" : "Draft"}
                  </span>
                </p>
                {a.description && <p className="text-base text-slate-600">{a.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    setEditing({
                      id: a.id,
                      name: a.name,
                      emoji: a.emoji ?? "",
                      description: a.description ?? "",
                    })
                  }
                  className="h-10 rounded-lg px-3 text-sm font-bold text-[var(--team)] underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => void remove(a)}
                  className="h-10 rounded-lg px-3 text-sm font-bold text-red-700 underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        {presets.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-base font-semibold">Quick picks</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  disabled={busy}
                  onClick={() =>
                    void save({ name: p.name, emoji: p.emoji, description: p.description })
                  }
                  className="h-11 rounded-full border-2 border-slate-300 bg-white px-3 text-base font-semibold active:bg-slate-100"
                >
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => setEditing({ name: "", emoji: "🏅", description: "" })}
          className={`${secondary} mt-3 w-full`}
        >
          + Make your own award
        </button>
      </section>

      {drafts.length > 0 && (
        <section className="rounded-2xl bg-slate-900 p-4 text-white">
          <h2 className="text-xl font-black">
            {drafts.length} award{drafts.length === 1 ? "" : "s"} ready to go
          </h2>
          <p className="mt-1 text-base text-white/80">
            Make live and every club team&apos;s coaches get &quot;Pick your winners&quot; in their
            To do, until the due date.
          </p>
          <button
            onClick={() => setGoLive(true)}
            className="mt-3 flex h-14 w-full items-center justify-center rounded-xl bg-white text-lg font-black text-slate-900"
          >
            🚀 Make live
          </button>
        </section>
      )}

      <Sheet
        open={editing !== null}
        title={editing?.id ? "Edit award" : "New award"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(editing);
            }}
          >
            <div className="flex gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="text-base font-semibold">Icon</span>
                <input
                  value={editing.emoji}
                  maxLength={8}
                  onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                  className={`${field} text-center text-2xl`}
                  aria-label="Icon (an emoji)"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-base font-semibold">Name</span>
                <input
                  value={editing.name}
                  maxLength={60}
                  required
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Team MVP"
                  className={field}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">What it&apos;s for (coaches see this)</span>
              <textarea
                value={editing.description}
                maxLength={200}
                rows={3}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-lg focus:border-[var(--team)] focus:outline-none"
              />
            </label>
            <button type="submit" disabled={busy || !editing.name.trim()} className={primary}>
              Save
            </button>
          </form>
        )}
      </Sheet>

      <Sheet open={goLive} title="Make awards live" onClose={() => setGoLive(false)}>
        {goLive && (
          <GoLive
            clubName={clubName}
            drafts={drafts}
            live={summary.live}
            today={today}
            groupMe={groupMe}
            onDone={async (dueOn, post) => {
              const m = await backend();
              await m.makeAwardsLive(clubId, season, dueOn);
              let posted = false;
              if (post) {
                await m.clubPost(clubId, true, [], post);
                posted = true;
              }
              setGoLive(false);
              reload();
              return posted;
            }}
          />
        )}
      </Sheet>

      <Sheet open={remind} title="Remind coaches" onClose={() => setRemind(false)}>
        {remind && (
          <PostForm
            initial={reminderMessage(summary, due, today)}
            onSend={async (text) => {
              await (await backend()).clubPost(clubId, true, [], text);
              setRemind(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={showing} title="Awards show list" onClose={() => setShowing(false)}>
        {showing && <ShowList clubName={clubName} season={season} summary={summary} />}
      </Sheet>
    </div>
  );
}

/** The ring: share of all picks in. */
function Ring({ picked, total }: { picked: number; total: number }) {
  const share = total ? picked / total : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-28 shrink-0"
      role="img"
      aria-label={`${picked} of ${total} picks in`}
    >
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--team)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="48" textAnchor="middle" className="fill-slate-900 text-[22px] font-black">
        {Math.round(share * 100)}%
      </text>
      <text x="50" y="66" textAnchor="middle" className="fill-slate-500 text-[11px] font-bold">
        {picked}/{total} in
      </text>
    </svg>
  );
}

function Bar({ label, picked, total }: { label: string; picked: number; total: number }) {
  const share = total ? picked / total : 0;
  return (
    <div>
      <div className="flex justify-between text-base">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-slate-600">
          {picked}/{total}
        </span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${share === 1 ? "bg-green-600" : "bg-[var(--team)]"}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

function Board({
  summary,
  due,
  today,
  groupMe,
  onRemind,
  onShow,
  onDue,
}: {
  summary: BoardSummary;
  due: string | null;
  today: string;
  groupMe: boolean;
  onRemind: () => void;
  onShow: () => void;
  onDue: (d: string) => Promise<void>;
}) {
  const [newDue, setNewDue] = useState(due ?? "");
  const late = due !== null && today > due;
  const ageGroups = [...new Set(summary.byTeam.map((t) => t.ageGroup))];
  if (summary.byTeam.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
        Your awards are live. Once teams join with this season&apos;s codes, their coaches can pick
        and the board fills in here.
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-4">
          <Ring picked={summary.picked} total={summary.total} />
          <div className="min-w-0">
            <p className="text-xl font-black">
              {summary.teamsToPick.length === 0
                ? "Every pick is in! 🎉"
                : `${summary.teamsToPick.length} team${summary.teamsToPick.length === 1 ? "" : "s"} still to pick`}
            </p>
            {due && (
              <p className={`text-base font-semibold ${late ? "text-red-700" : "text-slate-600"}`}>
                {late ? "Was due" : "Due"} {dueText(due)}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:ml-auto sm:flex sm:flex-col">
          <button onClick={onShow} className={secondary}>
            🏆 Awards show list
          </button>
          {summary.teamsToPick.length > 0 && groupMe && (
            <button onClick={onRemind} className={secondary}>
              📣 Remind coaches
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4">
          <h3 className={heading}>By award</h3>
          {summary.byAward.map((a) => (
            <Bar
              key={a.award.id}
              label={`${a.award.emoji ?? "🏅"} ${a.award.name}`}
              picked={a.picked}
              total={a.teams}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4">
          <h3 className={heading}>By age group</h3>
          {ageGroups.map((g) => {
            const teams = summary.byTeam.filter((t) => t.ageGroup === g);
            return (
              <Bar
                key={g}
                label={`${g} · ${teams.length} team${teams.length === 1 ? "" : "s"}`}
                picked={teams.reduce((n, t) => n + t.picked, 0)}
                total={teams.reduce((n, t) => n + t.awards, 0)}
              />
            );
          })}
        </div>
      </div>

      {/* Phones: a card per team, every award listed. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {summary.byTeam.map((t) => (
          <li key={t.teamId} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
            <p className="font-bold">
              {t.ageGroup} {t.teamName}
              {t.headCoach && <span className="font-normal text-slate-600"> · {t.headCoach}</span>}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {summary.live.map((a) => {
                const cell = t.cells[a.id];
                if (!cell) return null;
                const state = cellState(cell, a.dueOn, today);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-base">
                    <span className="min-w-0 truncate">
                      {a.emoji ?? "🏅"} {a.name}
                    </span>
                    {state === "picked" ? (
                      <span className="shrink-0 rounded-lg bg-green-50 px-2 py-0.5 font-semibold text-green-900">
                        {cell.jerseyNumber !== null ? `#${cell.jerseyNumber} ` : ""}
                        {cell.playerName}
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold ${state === "late" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                      >
                        {state === "late" ? "Late" : "To pick"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border-2 border-slate-200 bg-white sm:block">
        <table className="w-full min-w-[34rem] text-left text-base">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-bold">Team</th>
              {summary.live.map((a) => (
                <th key={a.id} className="px-3 py-2 font-bold">
                  {a.emoji ?? "🏅"} {a.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.byTeam.map((t) => (
              <tr key={t.teamId} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2">
                  <p className="font-bold">
                    {t.ageGroup} {t.teamName}
                  </p>
                  {t.headCoach && <p className="text-sm text-slate-600">{t.headCoach}</p>}
                </td>
                {summary.live.map((a) => {
                  const cell = t.cells[a.id];
                  if (!cell) return <td key={a.id} />;
                  const state = cellState(cell, a.dueOn, today);
                  return (
                    <td key={a.id} className="px-3 py-2">
                      {state === "picked" ? (
                        <span className="inline-flex rounded-lg bg-green-50 px-2 py-1 font-semibold text-green-900">
                          {cell.jerseyNumber !== null ? `#${cell.jerseyNumber} ` : ""}
                          {cell.playerName}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-sm font-bold ${state === "late" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                        >
                          {state === "late" ? "Late" : "To pick"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {due && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newDue) void onDue(newDue);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold">Due date</span>
            <input
              type="date"
              value={newDue}
              min={today}
              onChange={(e) => setNewDue(e.target.value)}
              className={field}
            />
          </label>
          <button type="submit" disabled={!newDue || newDue === due} className={secondary}>
            Change due date
          </button>
        </form>
      )}
    </section>
  );
}

function GoLive({
  clubName,
  drafts,
  live,
  today,
  groupMe,
  onDone,
}: {
  clubName: string;
  drafts: ClubAward[];
  live: ClubAward[];
  today: string;
  groupMe: boolean;
  onDone: (dueOn: string, post: string | null) => Promise<boolean>;
}) {
  const [dueOn, setDueOn] = useState(() => addDays(today, 14));
  const [post, setPost] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = edited ?? liveMessage(clubName, [...live, ...drafts], dueOn);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1 text-lg">
        {drafts.map((a) => (
          <li key={a.id}>
            {a.emoji ?? "🏅"} <b>{a.name}</b>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Coaches pick by</span>
        <input
          type="date"
          value={dueOn}
          min={today}
          onChange={(e) => setDueOn(e.target.value)}
          className={field}
        />
        {live.length > 0 && (
          <span className="text-sm text-slate-600">Your live awards move to this date too.</span>
        )}
      </label>
      {groupMe ? (
        <>
          <label className="flex items-center gap-3 text-base">
            <input
              type="checkbox"
              checked={post}
              onChange={(e) => setPost(e.target.checked)}
              className="size-6 accent-[var(--team)]"
            />
            Also post to the coaches GroupMe
          </label>
          {post && (
            <textarea
              value={text}
              rows={6}
              onChange={(e) => setEdited(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base focus:border-[var(--team)] focus:outline-none"
            />
          )}
        </>
      ) : (
        <p className="text-sm text-slate-600">
          Connect your coaches GroupMe on the GroupMe tab to announce it there too.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={busy || !dueOn || dueOn < today}
        onClick={() => {
          setBusy(true);
          setError(null);
          onDone(dueOn, post ? text : null)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
        className={primary}
      >
        {busy
          ? "Going live…"
          : `🚀 Make ${drafts.length} award${drafts.length === 1 ? "" : "s"} live`}
      </button>
    </div>
  );
}

function PostForm({
  initial,
  onSend,
}: {
  initial: string;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-slate-700">
        Goes to your coaches GroupMe. Change anything first.
      </p>
      <textarea
        value={text}
        rows={8}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base focus:border-[var(--team)] focus:outline-none"
      />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={busy || !text.trim()}
        onClick={() => {
          setBusy(true);
          setError(null);
          onSend(text)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
        className={primary}
      >
        {busy ? "Posting…" : "📣 Post to coaches"}
      </button>
    </div>
  );
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Winners by award, for the presenter: on screen, copied, or printed. */
function ShowList({
  clubName,
  season,
  summary,
}: {
  clubName: string;
  season: string;
  summary: BoardSummary;
}) {
  const list = showList(summary);
  const [copied, setCopied] = useState(false);
  const who = (w: BoardRow) =>
    `${w.jerseyNumber !== null ? `#${w.jerseyNumber} ` : ""}${w.playerName} (${w.ageGroup} ${w.teamName})`;
  const asText = list
    .map(
      ({ award, winners }) =>
        `${award.emoji ?? "🏅"} ${award.name}\n${winners.map((w) => `  ${who(w)}${w.note ? `: ${w.note}` : ""}`).join("\n") || "  (no picks yet)"}`,
    )
    .join("\n\n");
  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><meta charset="utf-8"><title>${esc(clubName)} awards ${esc(season)}</title>
<style>body{font:16px system-ui,sans-serif;margin:32px;color:#111}h1{margin:0 0 4px}h2{margin:28px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}li{margin:6px 0}.n{color:#555}</style>
<h1>${esc(clubName)} awards</h1><p class="n">${esc(season)} season</p>` +
        list
          .map(
            ({ award, winners }) =>
              `<h2>${esc(award.emoji ?? "🏅")} ${esc(award.name)}</h2><ul>${winners
                .map(
                  (w) =>
                    `<li><b>${esc(who(w))}</b>${w.note ? ` <span class="n">— ${esc(w.note)}</span>` : ""}</li>`,
                )
                .join("")}</ul>`,
          )
          .join(""),
    );
    win.document.close();
    win.focus();
    win.print();
  };
  return (
    <div className="flex flex-col gap-4">
      {list.map(({ award, winners }) => (
        <section key={award.id}>
          <h3 className="text-lg font-black">
            {award.emoji ?? "🏅"} {award.name}
          </h3>
          {winners.length === 0 ? (
            <p className="text-base text-slate-500">No picks yet.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {winners.map((w) => (
                <li key={w.teamId} className="text-base">
                  <b>{who(w)}</b>
                  {w.note && <span className="text-slate-600">: {w.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <div className="flex gap-2">
        <button onClick={print} className={`${secondary} flex-1`}>
          🖨️ Print
        </button>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(asText).then(() => setCopied(true));
          }}
          className={`${secondary} flex-1`}
        >
          {copied ? "Copied ✓" : "📋 Copy"}
        </button>
      </div>
    </div>
  );
}
