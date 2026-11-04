"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  GameWrite,
  Tournament,
  TournamentGame,
  TournamentTeam,
} from "@/lib/data/tournament-backend";
import { defaultFieldPlayers } from "@/lib/data/game";
import { importSchedule, newId } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { MAX_SCREENSHOTS } from "@/lib/tournaments/event";
import {
  byDay,
  findTeamGame,
  matchSchedule,
  matchScores,
  ourSide,
  placeOf,
  teamGameFor,
  teamIdFor,
  time12,
  winner,
  type ReadScore,
  type Schedule,
  type ScoreUpdate,
  type ScheduleGame,
  type ScheduleMatch,
} from "@/lib/tournaments/schedule";
import { Sheet } from "../Sheet";
import { ScreenshotButton, Thumb, sendScreenshots } from "./AddTournament";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/tournament-backend");

export const dayLabel = (d: string | null) =>
  d
    ? new Date(`${d}T12:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "Date not set";

export const gameLabel = (g: Pick<ScheduleGame, "gameNo" | "stage" | "pool" | "round">) =>
  [
    g.gameNo ? `Game ${g.gameNo}` : null,
    g.stage === "pool" ? (g.pool ? `Pool ${g.pool}` : "Pool play") : (g.round ?? "Bracket"),
  ]
    .filter(Boolean)
    .join(" · ");

/** The tournament's games by day, ours highlighted; coaches add or update from screenshots,
 * and anyone on the team reports scores of the games we're not in. */
export function TournamentSchedule({
  data,
  tournament,
  teams,
  canEdit,
  games,
  onChanged,
}: {
  data: AppData;
  tournament: Tournament;
  teams: TournamentTeam[];
  canEdit: boolean;
  games: TournamentGame[] | null;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [scoring, setScoring] = useState<TournamentGame | null>(null);
  const [scoreShots, setScoreShots] = useState(false);
  const ourName = teams.find((t) => t.isUs)?.name ?? null;
  const canScore = data.team.optionedAt === null;

  const load = () =>
    onChanged().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  const scored = games?.filter((g) => g.scoreHome !== null).length ?? 0;

  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
      <h2 className={heading}>Schedule</h2>
      {games === null ? (
        <p className="text-base text-slate-600">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-base text-slate-700">
          {canEdit
            ? "When the pool schedule and bracket come out, add screenshots of them. Your games go on the team's Games too."
            : "The schedule isn't out yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {canScore && scored < games.length && (
            <p className="text-sm text-slate-600">
              Tap a game to enter its final score. Anyone on the team can help keep scores up to
              date.
            </p>
          )}
          {byDay(games).map((d) => (
            <div key={d.date ?? "none"}>
              <h3 className="mb-1 text-base font-bold">{dayLabel(d.date)}</h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {d.games.map((g) => (
                  <GameRow
                    key={g.id}
                    g={g}
                    ours={!!ourSide(g, ourName)}
                    onOpen={canScore || canEdit ? () => setScoring(g) : undefined}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 md:flex-row">
        {canScore && !!games?.length && (
          <button
            onClick={() => setScoreShots(true)}
            className="h-12 rounded-xl border-2 border-[var(--team)] bg-white px-6 text-base font-bold text-[var(--team)]"
          >
            Update scores from screenshots
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setImporting(true)}
            className="h-12 rounded-xl bg-[var(--team)] px-6 text-base font-bold text-white active:bg-[var(--team-press)]"
          >
            {games?.length ? "Update the schedule" : "Add the schedule"}
          </button>
        )}
      </div>
      <Sheet
        open={scoreShots}
        title="Update scores from screenshots"
        onClose={() => setScoreShots(false)}
      >
        {scoreShots && games && (
          <ScoresImport
            data={data}
            tournament={tournament}
            games={games}
            canEdit={canEdit}
            onSaved={() => {
              setScoreShots(false);
              void load();
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={importing}
        title={games?.length ? "Update the schedule" : "Add the schedule"}
        onClose={() => setImporting(false)}
      >
        {importing && games && (
          <ScheduleImport
            data={data}
            tournament={tournament}
            teams={teams}
            saved={games}
            ourName={ourName}
            onSaved={() => {
              setImporting(false);
              void load();
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={scoring !== null}
        title={scoring ? gameLabel(scoring) : "Score"}
        onClose={() => setScoring(null)}
      >
        {scoring && (
          <ScoreSheet
            key={scoring.id}
            data={data}
            g={scoring}
            ours={!!ourSide(scoring, ourName)}
            canEdit={canEdit}
            canScore={canScore}
            onDone={() => {
              setScoring(null);
              void load();
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

function GameRow({ g, ours, onOpen }: { g: TournamentGame; ours: boolean; onOpen?: () => void }) {
  const won = winner(g);
  const side = (name: string, score: number | null, isWinner: boolean) => (
    <span className="flex items-baseline justify-between gap-2">
      <span className={`min-w-0 text-base ${isWinner ? "font-bold" : "font-semibold"}`}>
        {name}
      </span>
      {score !== null && (
        <span className={`shrink-0 text-lg tabular-nums ${isWinner ? "font-bold" : ""}`}>
          {score}
        </span>
      )}
    </span>
  );
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
        <span>
          {time12(g.startTime)} · {gameLabel(g)}
        </span>
        {won ? (
          <span className="text-slate-500">Final{g.locked ? " · 🔒" : ""}</span>
        ) : (
          ours && <span className="text-[var(--team)]">Our game</span>
        )}
      </span>
      {side(g.home, g.scoreHome, won === "home")}
      {side(g.away, g.scoreAway, won === "away")}
      {placeOf(g) && <span className="block text-sm text-slate-600">{placeOf(g)}</span>}
    </>
  );
  const box = `block w-full rounded-xl border-2 p-3 text-left ${ours ? "border-[var(--team)] bg-[var(--team)]/5" : "border-slate-200"}`;
  return (
    <li>
      {onOpen ? (
        <button onClick={onOpen} className={`${box} active:bg-slate-50`}>
          {body}
        </button>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

/** Enter or fix a game's final score; coaches also lock it or remove the game. */
function ScoreSheet({
  data,
  g,
  ours,
  canEdit,
  canScore,
  onDone,
}: {
  data: AppData;
  g: TournamentGame;
  ours: boolean;
  canEdit: boolean;
  canScore: boolean;
  onDone: () => void;
}) {
  const [home, setHome] = useState(g.scoreHome ?? 0);
  const [away, setAway] = useState(g.scoreAway ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const reporter = g.reportedBy
    ? g.reportedBy === data.me.userId
      ? "you"
      : (data.members.find((m) => m.userId === g.reportedBy)?.displayName ?? "someone on the team")
    : null;
  const when = g.reportedAt
    ? new Date(g.reportedAt).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const editable = canScore && !ours && (!g.locked || canEdit);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        {dayLabel(g.date)}, {time12(g.startTime)}
        {placeOf(g) ? ` · ${placeOf(g)}` : ""}
      </p>

      {ours ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-slate-700">
            This is our game. Its score comes from the game page: the coach marks it final with the
            score, and it shows here.
          </p>
          {g.gameId && (
            <Link
              href={`/games/${g.gameId}`}
              className="flex h-14 items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white"
            >
              Open our game
            </Link>
          )}
        </div>
      ) : editable ? (
        <>
          <Stepper label={g.home} value={home} onChange={setHome} />
          <Stepper label={g.away} value={away} onChange={setAway} />
          <button
            onClick={() => void run(async () => (await backend()).reportScore(g.id, home, away))}
            disabled={busy}
            className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
          >
            {g.scoreHome === null ? "Save final score" : "Save corrected score"}
          </button>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 p-3 text-base">
          {g.scoreHome !== null
            ? `Final: ${g.home} ${g.scoreHome}, ${g.away} ${g.scoreAway}.`
            : "No score yet."}
          {g.locked && " The coach locked this score."}
        </p>
      )}

      {reporter && !ours && (
        <p className="text-sm text-slate-600">
          Entered by {reporter}
          {when ? ` · ${when}` : ""}
          {g.locked ? " · locked by the coach" : ""}
        </p>
      )}

      {canEdit && !ours && (
        <div className="flex flex-col gap-2 border-t-2 border-slate-100 pt-3">
          {g.scoreHome !== null && (
            <button
              onClick={() =>
                void run(async () => (await backend()).setScoreLocked(g.id, !g.locked))
              }
              disabled={busy}
              className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
            >
              {g.locked ? "Unlock the score" : "Lock the score (only coaches can change it)"}
            </button>
          )}
          {g.scoreHome !== null && (
            <button
              onClick={() => void run(async () => (await backend()).reportScore(g.id, null, null))}
              disabled={busy}
              className="h-12 rounded-xl border-2 border-slate-300 bg-white text-base font-semibold disabled:opacity-40"
            >
              Clear the score
            </button>
          )}
        </div>
      )}
      {canEdit &&
        (confirmRemove ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmRemove(false)}
              className="h-12 rounded-xl border-2 border-slate-400 font-bold"
            >
              Keep it
            </button>
            <button
              onClick={() => void run(async () => (await backend()).removeGame(g.id))}
              disabled={busy}
              className="h-12 rounded-xl bg-red-700 font-bold text-white disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="h-12 rounded-xl border-2 border-red-200 bg-white text-base font-semibold text-red-700"
          >
            Remove this game from the schedule
            {ours ? " (the team game stays)" : ""}
          </button>
        ))}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}

/** Big minus / number / plus, for one thumb in the bleachers. */
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const btn =
    "flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-3xl font-bold active:bg-slate-100 disabled:opacity-30";
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 text-lg font-semibold">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        aria-label={`${label}: one less run`}
        className={btn}
      >
        −
      </button>
      <span className="w-12 text-center text-3xl font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(99, value + 1))}
        disabled={value === 99}
        aria-label={`${label}: one more run`}
        className={btn}
      >
        +
      </button>
    </div>
  );
}

/**
 * Save tournament games (new or changed); ours also become team games, or update the
 * linked one (lineup kept). Team games are saved first so the links hold.
 */
export async function saveScheduleGames({
  data,
  tournament,
  teams,
  saved,
  ourName,
  items,
}: {
  data: AppData;
  tournament: Tournament;
  teams: TournamentTeam[];
  saved: TournamentGame[];
  ourName: string | null;
  items: { id?: string; g: ScheduleGame; linked: string | null }[];
}): Promise<void> {
  const taken = new Set(saved.flatMap((s) => (s.gameId ? [s.gameId] : [])));
  const teamGames: Game[] = [];
  const writes: GameWrite[] = [];
  for (const { id, g, linked } of items) {
    let gameId = linked;
    const side = ourSide(g, ourName);
    if (side) {
      const existing = gameId
        ? (data.games.find((x) => x.id === gameId) ?? null)
        : findTeamGame(g, side.opponent, data.games, taken);
      const tg = teamGameFor(g, side.opponent, {
        existing,
        id: newId(),
        seasonId: data.season.id,
        fieldPlayers: defaultFieldPlayers(data.team.coachPitch),
        venues: tournament.venues,
      });
      if (tg) {
        teamGames.push(tg);
        gameId = tg.id;
        taken.add(tg.id);
      }
    }
    writes.push({
      id,
      game: g,
      homeTeamId: teamIdFor(g.home, teams),
      awayTeamId: teamIdFor(g.away, teams),
      gameId,
    });
  }
  if (teamGames.length) await importSchedule([], teamGames);
  await (await backend()).saveGames(tournament.id, writes);
}

/** Screenshots of results → scores matched to our games list → check → save. */
function ScoresImport({
  data,
  tournament,
  games,
  canEdit,
  onSaved,
}: {
  data: AppData;
  tournament: Tournament;
  games: TournamentGame[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<{
    updates: ScoreUpdate[];
    unmatched: ReadScore[];
    warnings: string[];
  } | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const readThem = async () => {
    setBusy(
      files.length === 1 ? "Reading the screenshot…" : `Reading ${files.length} screenshots…`,
    );
    setError(null);
    try {
      const { scores } = await sendScreenshots<{
        scores?: { games: ReadScore[]; warnings: string[] };
      }>({ teamId: data.team.id, tournamentId: tournament.id, kind: "scores" }, files);
      if (!scores) throw new Error("Couldn't read the screenshots. Try again.");
      setRead({ ...matchScores(games, scores.games), warnings: scores.warnings });
      setSkip(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">{busy}</p>
      </div>
    );
  }

  if (!read) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-slate-700">
          Screenshot the tournament&apos;s schedule or bracket with scores on it. RallyCap reads the
          final scores and matches them to the games here; you check them before they&apos;re saved.
        </p>
        {files.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.lastModified}-${i}`} className="relative">
                <Thumb file={f} />
                <button
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`Remove screenshot ${i + 1}`}
                  className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-slate-900/75 text-lg font-bold text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_SCREENSHOTS && (
          <ScreenshotButton
            onFiles={(picked) => setFiles([...files, ...picked].slice(0, MAX_SCREENSHOTS))}
            label={files.length ? "Add more screenshots" : "Add screenshots"}
            primary={files.length === 0}
          />
        )}
        {files.length > 0 && (
          <button
            onClick={() => void readThem()}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
          >
            Read the scores
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
            {error}
          </p>
        )}
        <p className="text-sm text-slate-600">
          Screenshots are sent to Claude (Anthropic&apos;s AI) to read them and aren&apos;t kept.
        </p>
      </div>
    );
  }

  const byId = new Map(games.map((g) => [g.id, g]));
  // Coaches can change locked scores; nobody changes our own games here.
  const saveable = read.updates.filter(
    (u) => u.status === "new" || u.status === "changed" || (u.status === "locked" && canEdit),
  );
  const chosen = saveable.filter((u) => !skip.has(u.id));
  const skipped = read.updates.filter((u) => !saveable.includes(u));

  const save = async () => {
    setBusy("Saving scores…");
    setError(null);
    try {
      const b = await backend();
      for (const u of chosen) await b.reportScore(u.id, u.scoreHome, u.scoreAway);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {read.warnings.length > 0 && (
        <ul className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base text-amber-950">
          {read.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {saveable.length === 0 ? (
        <p className="text-base text-slate-700">No new scores in these screenshots.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {saveable.map((u) => {
            const g = byId.get(u.id)!;
            const on = !skip.has(u.id);
            return (
              <li key={u.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(skip);
                      if (on) next.add(u.id);
                      else next.delete(u.id);
                      setSkip(next);
                    }}
                    className="mt-1 size-5 shrink-0 accent-[var(--team)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-600">
                      {u.status === "new"
                        ? "New"
                        : u.status === "locked"
                          ? "Locked: fix it"
                          : "Changed"}{" "}
                      · {gameLabel(g)}
                    </span>
                    <span className="flex justify-between gap-2 text-base">
                      <span className={u.scoreHome > u.scoreAway ? "font-bold" : ""}>{g.home}</span>
                      <span className="font-bold tabular-nums">{u.scoreHome}</span>
                    </span>
                    <span className="flex justify-between gap-2 text-base">
                      <span className={u.scoreAway > u.scoreHome ? "font-bold" : ""}>{g.away}</span>
                      <span className="font-bold tabular-nums">{u.scoreAway}</span>
                    </span>
                    {u.was && (
                      <span className="block text-sm font-semibold text-amber-800">
                        Was {u.was[0]}–{u.was[1]}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {(skipped.length > 0 || read.unmatched.length > 0) && (
        <div className="text-sm text-slate-600">
          {skipped.filter((u) => u.status === "same").length > 0 && (
            <p>{skipped.filter((u) => u.status === "same").length} already up to date.</p>
          )}
          {skipped.some((u) => u.status === "ours") && (
            <p>Our own games are scored on the game page, by marking them final.</p>
          )}
          {skipped.some((u) => u.status === "locked") && (
            <p>Scores the coach locked weren&apos;t changed.</p>
          )}
          {read.unmatched.length > 0 && (
            <p>
              Not on this schedule: {read.unmatched.map((u) => `${u.home} vs ${u.away}`).join(", ")}
              .
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={() => setRead(null)}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Back
        </button>
        <button
          onClick={() => void save()}
          disabled={chosen.length === 0}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
        >
          Save {chosen.length} score{chosen.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

type ImportPick =
  { kind: "add"; g: ScheduleGame } | { kind: "change"; id: string; g: ScheduleGame };

/** Screenshots → what's new and what changed → the coach picks → save (team games too). */
function ScheduleImport({
  data,
  tournament,
  teams,
  saved,
  ourName,
  onSaved,
}: {
  data: AppData;
  tournament: Tournament;
  teams: TournamentTeam[];
  saved: TournamentGame[];
  ourName: string | null;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<{ schedule: Schedule; match: ScheduleMatch } | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const readThem = async () => {
    setBusy(
      files.length === 1 ? "Reading the screenshot…" : `Reading ${files.length} screenshots…`,
    );
    setError(null);
    try {
      const { schedule } = await sendScreenshots<{ schedule?: Schedule }>(
        { teamId: data.team.id, tournamentId: tournament.id },
        files,
      );
      if (!schedule) throw new Error("Couldn't read the screenshots. Try again.");
      setRead({ schedule, match: matchSchedule(saved, schedule.games) });
      setSkip(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">{busy}</p>
        <p className="text-base text-slate-600">This can take up to a minute.</p>
      </div>
    );
  }

  if (!read) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-slate-700">
          Take screenshots of the pool play schedule and the bracket (several if they&apos;re long).
          RallyCap lists every game; your games also go on the team&apos;s Games. Updated schedule?
          Add the new screenshots and you&apos;ll see only what changed.
        </p>
        {files.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.lastModified}-${i}`} className="relative">
                <Thumb file={f} />
                <button
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`Remove screenshot ${i + 1}`}
                  className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-slate-900/75 text-lg font-bold text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_SCREENSHOTS && (
          <ScreenshotButton
            onFiles={(picked) => setFiles([...files, ...picked].slice(0, MAX_SCREENSHOTS))}
            label={files.length ? "Add more screenshots" : "Add screenshots"}
            primary={files.length === 0}
          />
        )}
        {files.length > 0 && (
          <button
            onClick={() => void readThem()}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
          >
            Read {files.length === 1 ? "the screenshot" : `${files.length} screenshots`}
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
            {error}
          </p>
        )}
        <p className="text-sm text-slate-600">
          Screenshots are sent to Claude (Anthropic&apos;s AI) to read them and aren&apos;t kept.
          Nothing is saved until you confirm.
        </p>
      </div>
    );
  }

  const { match, schedule } = read;
  const picks: (ImportPick & { key: string; changes?: string[] })[] = [
    ...match.added.map((g, i) => ({ kind: "add" as const, g, key: `a${i}` })),
    ...match.changed.map((c) => ({
      kind: "change" as const,
      id: c.saved.id,
      g: c.next,
      key: c.saved.id,
      changes: c.changes,
    })),
  ];
  // Ours, already saved and unchanged, but not on the team's Games yet (e.g. "That's us" later).
  const toLink = match.unchanged.filter((s) => !s.gameId && ourSide(s, ourName));
  const chosen = picks.filter((p) => !skip.has(p.key));

  const save = async () => {
    setBusy("Saving…");
    setError(null);
    try {
      const items = [
        ...chosen.map((p) =>
          p.kind === "add"
            ? { g: p.g, linked: null }
            : { id: p.id, g: p.g, linked: saved.find((s) => s.id === p.id)?.gameId ?? null },
        ),
        ...toLink.map((s) => ({ id: s.id, g: s as ScheduleGame, linked: null })),
      ];
      await saveScheduleGames({ data, tournament, teams, saved, ourName, items });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const oursCount = [...chosen.map((p) => p.g), ...toLink].filter((g) =>
    ourSide(g, ourName),
  ).length;
  const nothing = picks.length === 0 && toLink.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {schedule.warnings.length > 0 && (
        <ul className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base text-amber-950">
          {schedule.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {!ourName && (
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base">
          Your team isn&apos;t marked in this tournament yet, so no games are added to Games. Tap
          “That&apos;s us” on your team, then update the schedule again.
        </p>
      )}
      <p className="text-base text-slate-700">
        {[
          match.added.length && `${match.added.length} new`,
          match.changed.length && `${match.changed.length} changed`,
          match.unchanged.length && `${match.unchanged.length} the same`,
        ]
          .filter(Boolean)
          .join(" · ") || "No games found in the screenshots."}
        {match.notShown.length > 0 &&
          ` ${match.notShown.length} saved game${match.notShown.length === 1 ? " isn't" : "s aren't"} in these screenshots; ${match.notShown.length === 1 ? "it stays" : "they stay"}.`}
      </p>
      {picks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {picks.map((p) => {
            const ours = !!ourSide(p.g, ourName);
            const on = !skip.has(p.key);
            return (
              <li key={p.key}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-white p-3 ${ours ? "border-[var(--team)]" : "border-slate-200"}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(skip);
                      if (on) next.add(p.key);
                      else next.delete(p.key);
                      setSkip(next);
                    }}
                    className="mt-1 size-5 shrink-0 accent-[var(--team)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-600">
                      {p.kind === "add" ? "New" : "Changed"} · {dayLabel(p.g.date)},{" "}
                      {time12(p.g.startTime)} · {gameLabel(p.g)}
                    </span>
                    <span className="block text-base font-bold">
                      {p.g.home} <span className="font-normal text-slate-500">vs</span> {p.g.away}
                    </span>
                    {placeOf(p.g) && (
                      <span className="block text-sm text-slate-600">{placeOf(p.g)}</span>
                    )}
                    {p.changes && (
                      <span className="block text-sm font-semibold text-amber-800">
                        {p.changes.join(", ")}
                      </span>
                    )}
                    {ours && (
                      <span className="block text-sm font-semibold text-[var(--team)]">
                        {p.kind === "add"
                          ? "Our game: added to Games"
                          : "Our game: Games updated (lineup kept)"}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {toLink.length > 0 && (
        <p className="text-base text-slate-700">
          {toLink.length} of our saved game{toLink.length === 1 ? "" : "s"} will be added to Games.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={() => setRead(null)}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Back
        </button>
        <button
          onClick={() => void save()}
          disabled={nothing || (chosen.length === 0 && toLink.length === 0)}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
        >
          {oursCount
            ? `Save (${oursCount} of ours to Games)`
            : `Save ${chosen.length + toLink.length} game${chosen.length + toLink.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
