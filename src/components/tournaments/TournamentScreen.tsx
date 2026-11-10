"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Tournament, TournamentGame, TournamentTeam } from "@/lib/data/tournament-backend";
import { permissionsFor } from "@/lib/data/permissions";
import { unplayedTournamentGames } from "@/lib/data/gameDelete";
import {
  deleteGames,
  importSchedule,
  setTournamentCount,
  useAppData,
  useStoreState,
} from "@/lib/data/store";
import type { GamePlace } from "@/lib/places/maps";
import { MAX_SCREENSHOTS, newTeams, pickDivision, teamKey } from "@/lib/tournaments/event";
import { gamesAtVenues, scheduleText, venueFor, venuesSavedNote } from "@/lib/tournaments/venues";
import { AppShell, Loading } from "../AppShell";
import { DeleteGamePanel } from "../DeleteGamePanel";
import { Sheet } from "../Sheet";
import { LinkFields, checkLinks, readTournament, type LinkInputs } from "./AddTournament";
import { TournamentSchedule, type ImportMode } from "./TournamentSchedule";
import { TournamentStandings } from "./TournamentStandings";
import { TournamentVenues } from "./TournamentVenues";
import { tournamentWhen } from "./TournamentsScreen";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/tournament-backend");

type Step = {
  title: string;
  done: boolean;
  status: string;
  label: string;
  /** What the button says; `label` is for screen readers. */
  short: string;
  onClick?: () => void;
  onFiles?: (files: File[]) => void;
};

/** A Set up step's button: screenshots straight from the picker, or a sheet. */
function StepButton({
  step,
  primary,
  disabled,
}: {
  step: Step;
  primary: boolean;
  disabled: boolean;
}) {
  const look = `flex h-11 shrink-0 items-center justify-center rounded-xl px-4 text-base font-bold ${primary ? "bg-[var(--team)] text-white active:bg-[var(--team-press)]" : "border-2 border-slate-300 bg-white active:bg-slate-100"} ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (step.onFiles) {
    const onFiles = step.onFiles;
    return (
      <label className={`${look} cursor-pointer`} aria-label={step.label}>
        {step.short}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) onFiles(picked);
          }}
        />
      </label>
    );
  }
  return (
    <button onClick={step.onClick} disabled={disabled} className={look} aria-label={step.label}>
      {step.short}
    </button>
  );
}

/** One tournament: its details, links for the team, and the teams in our division. */
export function TournamentScreen({ id }: { id: string }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const router = useRouter();
  const [t, setT] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [games, setGames] = useState<TournamentGame[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [alsoGames, setAlsoGames] = useState(true);
  // Set once a delete starts, so the sheet holds still while the games disappear.
  const [deleting, setDeleting] = useState(false);
  const [editLinks, setEditLinks] = useState<LinkInputs | null>(null);
  const [importing, setImporting] = useState<ImportMode | null>(null);

  const load = useCallback(async () => {
    const b = await backend();
    const [r, g] = await Promise.all([b.getTournament(id), b.listGames(id)]);
    if (!r) setMissing(true);
    else {
      setT(r.tournament);
      setTeams(r.teams);
      setGames(g);
    }
  }, [id]);

  useEffect(() => {
    if (mode !== "supabase") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this page's data
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load, mode]);

  const shell = (children: React.ReactNode) => (
    <AppShell
      title={t?.name ?? "Tournament"}
      subtitle={t ? tournamentWhen(t) : undefined}
      backHref="/tournaments"
      tab="tournaments"
    >
      {children}
    </AppShell>
  );
  if (!data) return shell(<Loading />);
  if (mode !== "supabase") return shell(<p className="text-lg">Tournaments need sign-in.</p>);
  if (missing) return shell(<p className="text-lg">This tournament doesn&apos;t exist.</p>);
  if (!t) return shell(error ? <p className="text-base text-red-700">{error}</p> : <Loading />);
  const canEdit = permissionsFor(data.me.role).editTeam;

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      const msg = await fn();
      if (msg) setNote(msg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fromScreenshots = (files: File[]) =>
    run(
      files.length === 1 ? "Reading the screenshot…" : `Reading ${files.length} screenshots…`,
      async () => {
        const event = await readTournament(data.team.id, files);
        const division =
          event.divisions.find((d) => teamKey(d.name) === teamKey(t.division ?? "")) ??
          event.divisions.find(
            (d) => d.name === pickDivision(event.divisions, t.division ?? data.team.ageGroup),
          ) ??
          (event.divisions.length === 1 ? event.divisions[0] : undefined);
        if (!division) return "No teams for this division were found in the screenshots.";
        const fresh = newTeams(teams, division.teams);
        await (await backend()).addTeams(t.id, fresh, "screenshot");
        return fresh.length
          ? `${fresh.length} team${fresh.length === 1 ? "" : "s"} added.`
          : "No new teams in the screenshots.";
      },
    );

  const ours = teams.find((x) => x.isUs);
  const links: [string, string][] = [];
  for (const [label, href] of [
    ["Tournament site", t.infoUrl],
    ["Schedule page", t.scheduleUrl],
    ["Bracket page", t.bracketUrl],
  ] as const) {
    if (href) links.push([label, href]);
  }
  const others = teams.filter((x) => !x.isUs);
  const unplayed = unplayedTournamentGames(games ?? [], data.games);
  const gamesWord = `${unplayed.games.length} game${unplayed.games.length === 1 ? "" : "s"}`;
  // The schedule shows the tournament's park; what the screenshots said stays underneath.
  const shownGames =
    games?.map((g) => ({
      ...g,
      parkName: venueFor(scheduleText(g), t.places)?.name ?? null,
    })) ?? null;
  /** Save the parks, then put our games in the tournament at them. */
  const savePlaces = async (places: GamePlace[]): Promise<string> => {
    await (await backend()).setPlaces(t.id, places);
    const moved = gamesAtVenues(data.games, games ?? [], places);
    if (moved.games.length) await importSchedule([], moved.games);
    await load();
    return places.length
      ? venuesSavedNote(moved)
      : "Removed. Your games keep the address they had.";
  };
  const afterDelete = () => {
    setTournamentCount(Math.max(0, (data.tournamentCount ?? 1) - 1));
    router.push("/tournaments");
  };
  const poolCount = (games ?? []).filter((g) => g.stage === "pool").length;
  const bracketCount = (games ?? []).filter((g) => g.stage === "bracket").length;
  const gamesCount = (n: number) => `${n} game${n === 1 ? "" : "s"} saved`;
  // The first step not done yet is the one to do next.
  const steps: Step[] = [
    {
      title: "Teams",
      done: teams.length > 0,
      status: teams.length
        ? `${teams.length} team${teams.length === 1 ? "" : "s"}${ours ? "" : " · tap “That’s us” on yours"}`
        : "From the tournament's team list",
      label: teams.length ? "Add more teams" : "Add teams",
      short: teams.length ? "Add more" : "Add",
      onFiles: (f) => void fromScreenshots(f.slice(0, MAX_SCREENSHOTS)),
    },
    {
      title: "Pool schedule",
      done: poolCount > 0,
      status: poolCount ? gamesCount(poolCount) : "When it comes out",
      label: poolCount ? "Update the pool schedule" : "Add the pool schedule",
      short: poolCount ? "Update" : "Add",
      onClick: () => setImporting("schedule"),
    },
    {
      title: "Bracket",
      done: bracketCount > 0,
      status: bracketCount ? gamesCount(bracketCount) : "When it comes out",
      label: bracketCount ? "Update the bracket" : "Add the bracket",
      short: bracketCount ? "Update" : "Add",
      onClick: () => setImporting("bracket"),
    },
  ];
  const next = steps.findIndex((x) => !x.done);
  const status = (
    <>
      {busy && (
        <p role="status" className="mt-2 text-base font-semibold text-slate-700">
          {busy}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 text-base font-semibold text-green-800">
          {note}
        </p>
      )}
      {error && editLinks === null && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}
    </>
  );
  return shell(
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      {/* What it is, where to read more, and the bracket. */}
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
        <p className="text-base font-semibold text-slate-800">
          {[t.organization, tournamentWhen(t), t.city].filter(Boolean).join(" · ")}
        </p>
        {t.division && <p className="text-base text-slate-700">Division: {t.division}</p>}
        {t.venues.length > 0 && t.places.length === 0 && (
          <p className="text-sm text-slate-600">Fields: {t.venues.join(", ")}</p>
        )}
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          {bracketCount > 0 && (
            <Link
              href={`/tournaments/${t.id}/bracket`}
              className="flex h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--team)] px-6 text-base font-bold text-white active:bg-[var(--team-press)]"
            >
              View bracket
            </Link>
          )}
          {(links.length > 0 || canEdit) && (
            <ul className="flex flex-wrap gap-2">
              {links.map(([label, href]) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-1 rounded-full border-2 border-slate-200 px-3 text-sm font-semibold text-[var(--team)] active:bg-slate-50"
                  >
                    {label}
                    <span aria-hidden className="text-slate-400">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
              {canEdit && (
                <li>
                  <button
                    onClick={() =>
                      setEditLinks({
                        info: t.infoUrl ?? "",
                        schedule: t.scheduleUrl ?? "",
                        bracket: t.bracketUrl ?? "",
                      })
                    }
                    className="flex min-h-11 items-center rounded-full border-2 border-dashed border-slate-300 px-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
                  >
                    {links.length ? "Edit links" : "+ Add the tournament's links"}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </section>

      {/* Coaches: the steps to get the tournament in, each with its own button. */}
      {canEdit && (
        <section className="rounded-xl border-2 border-slate-200 bg-white p-4 md:col-span-2">
          <details open={next !== -1} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Set up</h2>
              {next === -1 && (
                <span className="text-sm font-semibold text-green-800">
                  All in ✓ <span className="text-slate-500 group-open:hidden">· Update</span>
                </span>
              )}
            </summary>
            <ol className="mt-1 grid gap-2 md:grid-cols-3">
              {steps.map((x, i) => (
                <li
                  key={x.title}
                  className="flex items-center gap-3 rounded-xl border-2 border-slate-100 p-3"
                >
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${x.done ? "bg-green-700 text-white" : "border-2 border-slate-300 text-slate-500"}`}
                  >
                    {x.done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">
                      {x.title}
                      <span className="sr-only">{x.done ? " (done)" : ""}</span>
                    </span>
                    <span className="block text-sm text-slate-600">{x.status}</span>
                  </span>
                  <StepButton step={x} primary={i === next} disabled={busy !== null} />
                </li>
              ))}
            </ol>
          </details>
          {status}
        </section>
      )}

      <TournamentStandings
        data={data}
        tournament={t}
        teams={teams}
        games={shownGames}
        canEdit={canEdit}
        onChanged={load}
      />

      <TournamentSchedule
        data={data}
        tournament={t}
        teams={teams}
        canEdit={canEdit}
        games={shownGames}
        onChanged={load}
        importing={importing}
        onImportClose={() => setImporting(null)}
      />

      <TournamentVenues
        data={data}
        tournament={t}
        canEdit={canEdit}
        ourGames={(games ?? []).filter((g) => g.gameId).length}
        onSave={savePlaces}
      />

      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className={heading}>Teams ({teams.length})</h2>
        {ours ? (
          <p className="mb-2 rounded-lg border-2 border-[var(--team)] p-2 text-base">
            <b>{ours.name}</b> <span className="text-slate-600">(us)</span>
          </p>
        ) : (
          canEdit &&
          others.length > 0 && (
            <p className="mb-2 text-sm text-slate-600">
              Your team isn&apos;t marked yet. Tap “That’s us” on it.
            </p>
          )
        )}
        {others.length === 0 ? (
          <p className="text-base text-slate-700">
            {canEdit ? "No teams yet. Add them in Set up above." : "No other teams yet."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {others.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{x.name}</span>
                  <span className="block text-sm text-slate-600">
                    {[x.hometown, x.classLabel].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {canEdit && (
                  <>
                    {!ours && (
                      <button
                        onClick={() =>
                          void run("Saving…", async () => {
                            await (await backend()).setOurTeam(t.id, x.id);
                          })
                        }
                        className="h-11 shrink-0 rounded-lg border-2 border-slate-300 px-3 text-sm font-semibold"
                      >
                        That&apos;s us
                      </button>
                    )}
                    <button
                      onClick={() =>
                        void run("Removing…", async () => {
                          await (await backend()).removeTeam(x.id);
                        })
                      }
                      aria-label={`Remove ${x.name}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100"
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!canEdit && status}
      </section>

      {canEdit && (
        <div className="flex flex-col gap-2 border-t-2 border-slate-200 pt-4 md:col-span-2 md:flex-row md:justify-end">
          {unplayed.games.length > 0 && (
            <button
              onClick={() => setConfirmDrop(true)}
              className="h-12 rounded-xl border-2 border-red-200 bg-white px-6 text-base font-semibold text-red-700"
            >
              We&apos;re not playing in this one
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="h-12 rounded-xl border-2 border-red-200 bg-white px-6 text-base font-semibold text-red-700"
          >
            Delete tournament
          </button>
        </div>
      )}
      <Sheet open={editLinks !== null} title="Tournament links" onClose={() => setEditLinks(null)}>
        {editLinks && (
          <div className="flex flex-col gap-4">
            <LinkFields value={editLinks} onChange={setEditLinks} />
            {error && (
              <p role="alert" className="text-base font-semibold text-red-700">
                {error}
              </p>
            )}
            <button
              onClick={() => {
                const checked = checkLinks(editLinks);
                if (typeof checked === "string") {
                  setError(checked);
                  return;
                }
                void run("Saving…", async () => {
                  await (await backend()).setLinks(t.id, checked);
                  setEditLinks(null);
                });
              }}
              disabled={busy !== null}
              className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
            >
              Save links
            </button>
          </div>
        )}
      </Sheet>
      <Sheet
        open={confirmDrop}
        title="Not playing in this one?"
        onClose={() => setConfirmDrop(false)}
      >
        {confirmDrop && (
          <DeleteGamePanel
            games={unplayed.games}
            tournamentName={t.name}
            action="Remove"
            onDelete={async () => {
              await (await backend()).removeGames(unplayed.rowIds);
              await deleteGames(unplayed.games.map((g) => g.id));
            }}
            onDone={() => {
              setConfirmDrop(false);
              void load().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              );
            }}
            onCancel={() => setConfirmDrop(false)}
          >
            <p className="font-bold">
              Remove our {gamesWord} from {t.name} and from Games?
            </p>
            <p>Any lineups made for them go too. Games already marked final stay.</p>
            <p className="text-sm text-slate-600">
              Change your mind? Add the schedule screenshot again and they come back as New.
            </p>
          </DeleteGamePanel>
        )}
      </Sheet>
      <Sheet
        open={confirmDelete}
        title="Delete this tournament?"
        onClose={() => setConfirmDelete(false)}
      >
        {unplayed.games.length > 0 && !deleting && (
          <label className="mb-3 flex items-center gap-3 text-base font-semibold">
            <input
              type="checkbox"
              checked={alsoGames}
              onChange={(e) => setAlsoGames(e.target.checked)}
              className="size-6 accent-[var(--team)]"
            />
            Also remove {gamesWord} we haven&apos;t played from Games
          </label>
        )}
        {deleting || (unplayed.games.length > 0 && alsoGames) ? (
          <DeleteGamePanel
            key="with-games"
            games={unplayed.games}
            tournamentName={t.name}
            action="Delete"
            onDelete={async () => {
              setDeleting(true);
              await (await backend()).deleteTournament(t.id);
              await deleteGames(unplayed.games.map((g) => g.id));
            }}
            onDone={afterDelete}
            onCancel={() => setConfirmDelete(false)}
          >
            <p>
              {t.name} and its team list are removed for everyone on the team, along with these{" "}
              {gamesWord} and any lineups made for them. Games already marked final stay.
            </p>
          </DeleteGamePanel>
        ) : (
          <>
            <p className="mb-4 text-lg">
              {t.name} and its team list are removed for everyone on the team. Your games
              aren&apos;t touched.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold"
              >
                Keep it
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    await (await backend()).deleteTournament(t.id);
                    afterDelete();
                  })()
                }
                className="h-14 rounded-xl bg-red-700 text-lg font-bold text-white"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>,
  );
}
