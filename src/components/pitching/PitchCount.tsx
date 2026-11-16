"use client";

import { useEffect, useState } from "react";
import type { KidGame } from "@/lib/boxscore/stats";
import { formatGameDate } from "@/lib/data/game";
import type { Game } from "@/lib/data/types";
import {
  PITCH_AGES,
  KIND_LABEL,
  agesFromTeam,
  armStatus,
  whenLabel,
  type PitchAges,
  type PitchSession,
  type SessionKind,
} from "@/lib/pitching/rest";
import { pendingCounts, type CoachCount, type PendingCount } from "@/lib/pitching/review";
import type { Player } from "@/lib/rules/types";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";
import { usePitchLog, type NewSession } from "./pitchData";

const heading = "text-sm font-bold tracking-wide text-slate-600 uppercase";
const KINDS: SessionKind[] = ["game", "bullpen", "lesson", "other_team"];
const KIND_ICON: Record<SessionKind, string> = {
  game: "⚾",
  bullpen: "🎯",
  lesson: "🧑‍🏫",
  other_team: "🔁",
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** A count in progress, kept on the phone so closing the sheet (or the app) doesn't lose it. */
interface Live {
  draft: NewSession;
  /** "b" ball, "s" strike, in order (for Undo). */
  log: ("b" | "s")[];
}
const liveKey = (athleteId: string) => `rallycap:pitch-live:${athleteId}`;
function readLive(athleteId: string): Live | null {
  try {
    const raw = window.localStorage.getItem(liveKey(athleteId));
    return raw ? (JSON.parse(raw) as Live) : null;
  } catch {
    return null;
  }
}
function writeLive(athleteId: string, live: Live | null) {
  try {
    if (live) window.localStorage.setItem(liveKey(athleteId), JSON.stringify(live));
    else window.localStorage.removeItem(liveKey(athleteId));
  } catch {
    // Unavailable: the count stays on screen.
  }
}

/**
 * A parent's pitch count for their kid: whether they can pitch today (Pitch Smart), the
 * coach's counts to approve, and every game, bullpen, lesson and game for another team,
 * counted live or entered as a total. Follows the kid from team to team.
 */
export function PitchCount({
  kid,
  athleteId,
  ageGroup,
  games,
  coachLines,
  today,
  unlocked,
  onUnlock,
}: {
  kid: Player;
  athleteId: string | null;
  ageGroup: string | null;
  /** The open team's games, to pick from. */
  games: Game[];
  /** The kid's lines from coaches' box scores (and typed counts). */
  coachLines: KidGame[];
  today: string;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const log = usePitchLog(unlocked ? athleteId : null);
  const [adding, setAdding] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  // The counter sheet; closing it keeps the count (on the phone) to come back to.
  const [counting, setCounting] = useState(false);
  const [editing, setEditing] = useState<PitchSession | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pickAges, setPickAges] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a count saved on this phone
    if (athleteId) setLive(readLive(athleteId));
  }, [athleteId]);

  if (!unlocked) {
    return (
      <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
        <h2 className={`${heading} mb-2`}>⚾ Pitch count</h2>
        <p className="text-base">
          Every pitch {kid.name} throws, for every team, plus bullpens and lessons, and when they
          can pitch again under Pitch Smart&apos;s rest rules. Coaches&apos; counts come in for you
          to approve.
        </p>
        <button
          onClick={onUnlock}
          className="mt-3 h-12 w-full rounded-xl bg-[var(--team)] text-base font-bold text-white"
        >
          🔒 Unlock with the Player pass
        </button>
      </section>
    );
  }
  if (!athleteId) return null;

  const fromTeam = agesFromTeam(ageGroup);
  const ages: PitchAges = log.ages ?? fromTeam ?? "9-10";
  const arm = armStatus(log.sessions, ages, today);
  const counts: CoachCount[] = coachLines
    .filter((g) => g.source === "coach" && (g.pitching?.pitches ?? 0) > 0)
    .map((g) => ({
      statId: g.id,
      gameId: g.gameId ?? null,
      date: g.gameDate,
      opponent: g.opponent,
      teamName: g.teamName,
      pitches: g.pitching!.pitches,
      strikes: g.pitching!.strikes || null,
    }));
  const pending = pendingCounts(counts, log.sessions, log.dismissals);
  const sessions = [...log.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const shown = showAll ? sessions : sessions.slice(0, 6);

  const run = (p: Promise<unknown>, done: string) =>
    p.then(
      () => toast(done),
      (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
    );

  const approve = (p: PendingCount) => {
    const c = p.count;
    const s = {
      kind: "game" as const,
      date: c.date,
      pitches: c.pitches,
      strikes: c.strikes,
      gameId: c.gameId,
      statId: c.statId,
      label: c.opponent,
    };
    return run(p.existing ? log.update(p.existing.id, s) : log.add(s), "Added to the pitch log");
  };

  const startLive = (draft: NewSession) => {
    const next = { draft, log: [] };
    writeLive(athleteId, next);
    setLive(next);
    setAdding(false);
    setCounting(true);
  };

  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      <h2 className={`${heading} mb-2`}>⚾ Pitch count</h2>

      {/* Can they pitch today? */}
      {log.loading ? (
        <p className="text-base text-slate-600">Loading…</p>
      ) : (
        <div
          className={`rounded-xl p-3 ${arm.resting ? "bg-amber-50 text-amber-950" : "bg-green-50 text-green-950"}`}
        >
          {arm.resting ? (
            <>
              <p className="text-xl font-black">
                Resting · can pitch {whenLabel(arm.canPitchOn, today)}
              </p>
              {arm.restFrom && (
                <p className="text-base">
                  {arm.restFrom.pitches} pitches on {dayLabel(arm.restFrom.date)} means{" "}
                  {arm.restFrom.days} day{arm.restFrom.days === 1 ? "" : "s"} of rest.
                </p>
              )}
            </>
          ) : arm.today > 0 ? (
            <>
              <p className="text-xl font-black">
                {arm.today} pitches today · up to {arm.leftToday} more
              </p>
              <p className="text-base">
                The most for ages {ages} is {arm.max} a day.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-black">Ready to pitch · up to {arm.max} today</p>
              <p className="text-base">Pitch Smart&apos;s daily most for ages {ages}.</p>
            </>
          )}
          <p className="mt-1 text-sm">
            Last 7 days: {arm.last7} pitches ({arm.last7Games} in games).
          </p>
        </div>
      )}

      {arm.warnings.slice(0, 3).map((w) => (
        <p
          key={w.date + w.message}
          className="mt-2 rounded-xl bg-red-50 p-3 text-base text-red-900"
        >
          ⚠️ {w.message}
        </p>
      ))}

      {/* The coach's counts to approve. */}
      {pending.map((p) => (
        <div key={p.count.statId} className="mt-3 rounded-xl border-2 border-[var(--team)] p-3">
          <p className="text-base">
            <b>
              Coach&apos;s count: {p.count.pitches} pitches
              {p.count.strikes ? ` (${p.count.strikes} strikes)` : ""}
            </b>{" "}
            vs {p.count.opponent}, {dayLabel(p.count.date)}
            {p.count.teamName ? ` (${p.count.teamName})` : ""}.
          </p>
          {p.reason === "yours" && p.existing && (
            <p className="text-base text-slate-700">
              You logged {p.existing.pitches} for this game.
            </p>
          )}
          {p.reason === "changed" && p.existing && (
            <p className="text-base text-slate-700">
              The coach changed it. You have {p.existing.pitches}.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void approve(p)}
              className="h-12 flex-1 rounded-xl bg-[var(--team)] text-base font-bold text-white"
            >
              {p.reason === "new" ? "Add to log" : `Use ${p.count.pitches}`}
            </button>
            <button
              onClick={() => void run(log.dismiss(p.count), "Got it")}
              className="h-12 flex-1 rounded-xl border-2 border-slate-400 bg-white text-base font-bold"
            >
              {p.reason === "new" ? "Not right" : `Keep ${p.existing?.pitches}`}
            </button>
          </div>
        </div>
      ))}

      <div className="mt-3 flex flex-col gap-2">
        {live ? (
          <button
            onClick={() => setCounting(true)}
            className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white"
          >
            Counting now: {live.log.length} pitch{live.log.length === 1 ? "" : "es"}
          </button>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
          >
            + Add a session
          </button>
        )}
      </div>

      {log.sessions.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y-2 divide-slate-100">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setEditing(s)}
                className="flex w-full items-center gap-3 py-2 text-left active:bg-slate-50"
              >
                <span aria-hidden="true" className="text-xl">
                  {KIND_ICON[s.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">
                    {KIND_LABEL[s.kind]}
                    {s.label ? ` · ${s.label}` : ""}
                  </span>
                  <span className="block text-sm text-slate-600">
                    {dayLabel(s.date)}
                    {s.statId ? " · from the coach" : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-xl font-black tabular-nums">{s.pitches}</span>
                  {s.strikes !== null && (
                    <span className="block text-xs text-slate-600">{s.strikes} strikes</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {log.sessions.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="h-10 text-base font-semibold underline"
        >
          {showAll ? "Show fewer" : `Show all ${log.sessions.length}`}
        </button>
      )}

      <p className="mt-3 text-sm text-slate-600">
        Limits: MLB and USA Baseball&apos;s Pitch Smart for ages {ages}
        {log.ages ? "" : fromTeam ? ` (from ${ageGroup})` : ""}.{" "}
        <button onClick={() => setPickAges(true)} className="font-semibold underline">
          Change
        </button>{" "}
        Your league&apos;s rules may be stricter. Only you and {kid.name}&apos;s other parents see
        this log.
      </p>

      <Sheet open={adding} title="Add a session" onClose={() => setAdding(false)}>
        {adding && (
          <AddSession
            games={games}
            today={today}
            onLive={startLive}
            onSave={async (s) => {
              await log.add(s);
              setAdding(false);
              toast("Saved to the pitch log");
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={counting && live !== null}
        title={
          live
            ? `${KIND_LABEL[live.draft.kind]}${live.draft.label ? ` · ${live.draft.label}` : ""}`
            : ""
        }
        onClose={() => setCounting(false)}
      >
        {live && (
          <Counter
            live={live}
            onChange={(next) => {
              writeLive(athleteId, next);
              setLive(next);
            }}
            onSave={async () => {
              const strikes = live.log.filter((x) => x === "s").length;
              await log.add({ ...live.draft, pitches: live.log.length, strikes });
              writeLive(athleteId, null);
              setLive(null);
              setCounting(false);
              toast(`Saved ${live.log.length} pitches`);
            }}
            onDiscard={() => {
              writeLive(athleteId, null);
              setLive(null);
              setCounting(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={editing !== null} title="Pitch session" onClose={() => setEditing(null)}>
        {editing && (
          <EditSession
            session={editing}
            onSave={async (s) => {
              await log.update(editing.id, s);
              setEditing(null);
              toast("Saved");
            }}
            onDelete={async () => {
              await log.remove(editing.id);
              setEditing(null);
              toast("Removed");
            }}
          />
        )}
      </Sheet>

      <Sheet open={pickAges} title="Pitch Smart ages" onClose={() => setPickAges(false)}>
        {pickAges && (
          <div className="flex flex-col gap-2">
            <p className="text-base">
              The daily most and rest days follow the kid&apos;s age. By default it comes from the
              team&apos;s age group{fromTeam ? ` (${ageGroup}: ages ${fromTeam})` : ""}.
            </p>
            {PITCH_AGES.map((a) => (
              <button
                key={a}
                onClick={() =>
                  void run(log.setAges(a === fromTeam ? null : a), "Saved").then(() =>
                    setPickAges(false),
                  )
                }
                aria-pressed={a === ages}
                className={`h-12 rounded-xl text-base font-bold ${a === ages ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"}`}
              >
                Ages {a}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </section>
  );
}

function AddSession({
  games,
  today,
  onLive,
  onSave,
}: {
  games: Game[];
  today: string;
  onLive: (draft: NewSession) => void;
  onSave: (s: NewSession) => Promise<void>;
}) {
  const [kind, setKind] = useState<SessionKind>("game");
  const [date, setDate] = useState(today);
  const [gameId, setGameId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [how, setHow] = useState<"live" | "total">("live");
  const [pitches, setPitches] = useState("");
  const [strikes, setStrikes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The team's games around now, newest first.
  const nearby = games
    .filter((g) => g.date <= today && g.date >= `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);
  const game = nearby.find((g) => g.id === gameId) ?? null;
  const draft = (): NewSession => ({
    kind,
    date: game ? game.date : date,
    pitches: 0,
    strikes: null,
    gameId: kind === "game" && game ? game.id : null,
    statId: null,
    label: (kind === "game" && game ? game.opponent : label.trim()) || null,
  });
  const p = Number(pitches);
  const s = strikes.trim() === "" ? null : Number(strikes);
  const totalOk = Number.isInteger(p) && p >= 1 && p <= 200 && (s === null || (s >= 0 && s <= p));
  const input = "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-base font-semibold">What was it?</p>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`min-h-14 rounded-xl px-2 text-base font-bold ${kind === k ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"}`}
            >
              {KIND_ICON[k]} {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {kind === "game" && (
        <label className="text-base font-semibold">
          Which game
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className={`${input} mt-1`}
          >
            <option value="">Another game (type it below)</option>
            {nearby.map((g) => (
              <option key={g.id} value={g.id}>
                vs {g.opponent} · {formatGameDate(g)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!(kind === "game" && game) && kind !== "bullpen" && (
        <label className="text-base font-semibold">
          {kind === "other_team"
            ? "Which team (and who they played)"
            : kind === "lesson"
              ? "Who ran it (optional)"
              : "Opponent"}
          <input
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            className={`${input} mt-1`}
          />
        </label>
      )}
      {!(kind === "game" && game) && (
        <label className="text-base font-semibold">
          Day
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className={`${input} mt-1`}
          />
        </label>
      )}

      <div>
        <p className="mb-1 text-base font-semibold">How do you want to count?</p>
        <div className="grid grid-cols-2 rounded-xl border-2 border-slate-300 p-1">
          {(["live", "total"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHow(h)}
              aria-pressed={how === h}
              className={`h-11 rounded-lg text-base font-bold ${how === h ? "bg-[var(--team)] text-white" : ""}`}
            >
              {h === "live" ? "Count as they happen" : "Enter the total"}
            </button>
          ))}
        </div>
      </div>

      {how === "total" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-semibold text-slate-600">
            Pitches
            <input
              inputMode="numeric"
              value={pitches}
              onChange={(e) => setPitches(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              className={`${input} text-xl font-bold`}
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            Strikes (optional)
            <input
              inputMode="numeric"
              value={strikes}
              onChange={(e) => setStrikes(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              className={`${input} text-xl font-bold`}
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {how === "live" ? (
        <button
          onClick={() => onLive(draft())}
          className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white"
        >
          Start counting
        </button>
      ) : (
        <button
          disabled={!totalOk || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSave({ ...draft(), pitches: p, strikes: s });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      )}
    </div>
  );
}

/** Big Ball and Strike buttons, one tap per pitch (one-handed, in the bleachers). */
function Counter({
  live,
  onChange,
  onSave,
  onDiscard,
}: {
  live: Live;
  onChange: (next: Live) => void;
  onSave: () => Promise<void>;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = live.log.length;
  const strikes = live.log.filter((x) => x === "s").length;
  const tap = (x: "b" | "s") => {
    if (total >= 200) return;
    navigator.vibrate?.(15);
    onChange({ ...live, log: [...live.log, x] });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <p className="text-7xl font-black tabular-nums">{total}</p>
        <p className="text-base text-slate-600">
          pitches · {strikes} strike{strikes === 1 ? "" : "s"}, {total - strikes} ball
          {total - strikes === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => tap("b")}
          className="h-32 rounded-2xl bg-slate-700 text-3xl font-black text-white active:bg-slate-900"
        >
          Ball
        </button>
        <button
          onClick={() => tap("s")}
          className="h-32 rounded-2xl bg-green-700 text-3xl font-black text-white active:bg-green-900"
        >
          Strike
        </button>
      </div>
      <p className="text-center text-sm text-slate-600">
        Fouls and balls in play count as strikes. The count stays on this phone until you save.
      </p>
      <button
        onClick={() => onChange({ ...live, log: live.log.slice(0, -1) })}
        disabled={total === 0}
        className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
      >
        Undo last pitch
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={total === 0 || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
      >
        Done · save {total} pitch{total === 1 ? "" : "es"}
      </button>
      <button
        onClick={() => {
          if (total === 0 || window.confirm("Throw away this count?")) onDiscard();
        }}
        className="h-10 text-sm font-semibold text-red-700 underline"
      >
        Throw away this count
      </button>
    </div>
  );
}

function EditSession({
  session,
  onSave,
  onDelete,
}: {
  session: PitchSession;
  onSave: (s: Partial<NewSession>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pitches, setPitches] = useState(String(session.pitches));
  const [strikes, setStrikes] = useState(session.strikes === null ? "" : String(session.strikes));
  const [date, setDate] = useState(session.date);
  const [error, setError] = useState<string | null>(null);
  const p = Number(pitches);
  const s = strikes.trim() === "" ? null : Number(strikes);
  const ok = Number.isInteger(p) && p >= 1 && p <= 200 && (s === null || (s >= 0 && s <= p));
  const input = "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-xl font-bold";
  const go = (f: () => Promise<void>) =>
    f().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base">
        {KIND_LABEL[session.kind]}
        {session.label ? ` · ${session.label}` : ""}
        {session.statId ? " · from the coach's box score" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold text-slate-600">
          Pitches
          <input
            inputMode="numeric"
            value={pitches}
            onChange={(e) => setPitches(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            className={input}
          />
        </label>
        <label className="text-sm font-semibold text-slate-600">
          Strikes (optional)
          <input
            inputMode="numeric"
            value={strikes}
            onChange={(e) => setStrikes(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            className={input}
          />
        </label>
      </div>
      {!session.gameId && (
        <label className="text-sm font-semibold text-slate-600">
          Day
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || session.date)}
            className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={!ok}
        onClick={() => void go(() => onSave({ pitches: p, strikes: s, date }))}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
      >
        Save
      </button>
      <button
        onClick={() => void go(onDelete)}
        className="h-12 text-base font-semibold text-red-700 underline"
      >
        Remove from the log
      </button>
    </div>
  );
}
