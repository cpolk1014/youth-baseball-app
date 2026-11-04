"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  ourSide,
  placeOf,
  teamGameFor,
  teamIdFor,
  time12,
  type Schedule,
  type ScheduleGame,
  type ScheduleMatch,
} from "@/lib/tournaments/schedule";
import { Sheet } from "../Sheet";
import { ScreenshotButton, Thumb, sendScreenshots } from "./AddTournament";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/tournament-backend");

const dayLabel = (d: string | null) =>
  d
    ? new Date(`${d}T12:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "Date not set";

const gameLabel = (g: Pick<ScheduleGame, "gameNo" | "stage" | "pool" | "round">) =>
  [
    g.gameNo ? `Game ${g.gameNo}` : null,
    g.stage === "pool" ? (g.pool ? `Pool ${g.pool}` : "Pool play") : (g.round ?? "Bracket"),
  ]
    .filter(Boolean)
    .join(" · ");

/** The tournament's games by day, ours highlighted; coaches add or update from screenshots. */
export function TournamentSchedule({
  data,
  tournament,
  teams,
  canEdit,
}: {
  data: AppData;
  tournament: Tournament;
  teams: TournamentTeam[];
  canEdit: boolean;
}) {
  const [games, setGames] = useState<TournamentGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const ourName = teams.find((t) => t.isUs)?.name ?? null;

  const load = useCallback(async () => {
    setGames(await (await backend()).listGames(tournament.id));
  }, [tournament.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this section's data
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const remove = async (id: string) => {
    setError(null);
    try {
      await (await backend()).removeGame(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
          {byDay(games).map((d) => (
            <div key={d.date ?? "none"}>
              <h3 className="mb-1 text-base font-bold">{dayLabel(d.date)}</h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {d.games.map((g) => (
                  <GameRow
                    key={g.id}
                    g={g}
                    ours={!!ourSide(g, ourName)}
                    onRemove={canEdit ? () => void remove(g.id) : undefined}
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
      {canEdit && (
        <button
          onClick={() => setImporting(true)}
          className="mt-3 h-12 w-full rounded-xl bg-[var(--team)] text-base font-bold text-white active:bg-[var(--team-press)] md:w-auto md:px-6"
        >
          {games?.length ? "Update the schedule" : "Add the schedule"}
        </button>
      )}
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
    </section>
  );
}

function GameRow({
  g,
  ours,
  onRemove,
}: {
  g: TournamentGame;
  ours: boolean;
  onRemove?: () => void;
}) {
  const body = (
    <>
      <p className="text-sm font-semibold text-slate-600">
        {time12(g.startTime)} · {gameLabel(g)}
      </p>
      <p className="text-base font-bold">
        {g.home} <span className="font-normal text-slate-500">vs</span> {g.away}
      </p>
      {placeOf(g) && <p className="text-sm text-slate-600">{placeOf(g)}</p>}
    </>
  );
  return (
    <li
      className={`flex items-start gap-2 rounded-xl border-2 p-3 ${ours ? "border-[var(--team)] bg-[var(--team)]/5" : "border-slate-200"}`}
    >
      {ours && g.gameId ? (
        <Link href={`/games/${g.gameId}`} className="min-w-0 flex-1">
          {body}
          <span className="mt-1 block text-sm font-semibold text-[var(--team)]">
            Our game: lineup and details →
          </span>
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${gameLabel(g)}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100"
        >
          ×
        </button>
      )}
    </li>
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
      const taken = new Set(saved.flatMap((s) => (s.gameId ? [s.gameId] : [])));
      const teamGames: Game[] = [];
      const writes: GameWrite[] = [];
      const plan = (id: string | undefined, g: ScheduleGame, linked: string | null) => {
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
      };
      for (const p of chosen) {
        if (p.kind === "add") plan(undefined, p.g, null);
        else plan(p.id, p.g, saved.find((s) => s.id === p.id)?.gameId ?? null);
      }
      for (const s of toLink) plan(s.id, s, null);
      if (teamGames.length) await importSchedule([], teamGames);
      await (await backend()).saveGames(tournament.id, writes);
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
