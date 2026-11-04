"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Tournament, TournamentGame, TournamentTeam } from "@/lib/data/tournament-backend";
import { permissionsFor } from "@/lib/data/permissions";
import { useAppData, useStoreState } from "@/lib/data/store";
import { MAX_SCREENSHOTS, newTeams, pickDivision, teamKey } from "@/lib/tournaments/event";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import {
  LinkFields,
  ScreenshotButton,
  checkLinks,
  readTournament,
  type LinkInputs,
} from "./AddTournament";
import { TournamentSchedule } from "./TournamentSchedule";
import { TournamentStandings } from "./TournamentStandings";
import { tournamentWhen } from "./TournamentsScreen";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/tournament-backend");

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
  const [editLinks, setEditLinks] = useState<LinkInputs | null>(null);

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
  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;

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
    ["Tournament info", t.infoUrl],
    ["Tournament schedule", t.scheduleUrl],
    ["Tournament bracket", t.bracketUrl],
  ] as const) {
    if (href) links.push([label, href]);
  }
  const others = teams.filter((x) => !x.isUs);
  return shell(
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className={heading}>The tournament</h2>
        <p className="text-lg font-bold">{t.name}</p>
        <p className="text-base text-slate-700">
          {[t.organization, tournamentWhen(t), t.city].filter(Boolean).join(" · ")}
        </p>
        {t.division && <p className="text-base text-slate-700">Division: {t.division}</p>}
        {t.venues.length > 0 && (
          <p className="mt-1 text-sm text-slate-600">Fields: {t.venues.join(", ")}</p>
        )}
        <p className="mt-2 text-sm text-slate-600">Scores, standings and what-ifs come next.</p>
      </section>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className={heading}>Links</h2>
        {links.length === 0 ? (
          <p className="text-base text-slate-700">
            {canEdit
              ? "Add the tournament's info, schedule and bracket pages so parents can open them here."
              : "No links yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {links.map(([label, href]) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 border-slate-200 px-3 py-2 text-base font-semibold text-[var(--team)] active:bg-slate-50"
                >
                  {label}
                  <span aria-hidden className="text-slate-400">
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <button
            onClick={() =>
              setEditLinks({
                info: t.infoUrl ?? "",
                schedule: t.scheduleUrl ?? "",
                bracket: t.bracketUrl ?? "",
              })
            }
            className="mt-3 h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
          >
            {links.length ? "Edit links" : "Add links"}
          </button>
        )}
      </section>

      <TournamentStandings
        data={data}
        tournament={t}
        teams={teams}
        games={games}
        canEdit={canEdit}
        onChanged={load}
      />

      <TournamentSchedule
        data={data}
        tournament={t}
        teams={teams}
        canEdit={canEdit}
        games={games}
        onChanged={load}
      />

      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className={heading}>Teams ({teams.length})</h2>
        {ours ? (
          <p className="mb-2 rounded-lg border-2 border-[var(--team)] p-2 text-base">
            <b>{ours.name}</b> <span className="text-slate-600">(us)</span>
          </p>
        ) : (
          canEdit && (
            <p className="mb-2 text-sm text-slate-600">
              Your team isn&apos;t marked yet. Tap “That’s us” on it when it shows up.
            </p>
          )
        )}
        {others.length === 0 ? (
          <p className="text-base text-slate-700">No other teams yet.</p>
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
                        className="h-10 shrink-0 rounded-lg border-2 border-slate-300 px-2 text-sm font-semibold"
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
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-100"
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="mt-3 flex flex-col gap-2">
            <ScreenshotButton
              onFiles={(f) => void fromScreenshots(f.slice(0, MAX_SCREENSHOTS))}
              label="Add teams from screenshots"
            />
          </div>
        )}
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
        {error && (
          <p role="alert" className="mt-2 text-base font-semibold text-red-700">
            {error}
          </p>
        )}
      </section>

      {canEdit && (
        <button
          onClick={() => setConfirmDelete(true)}
          className="h-12 rounded-xl border-2 border-red-200 bg-white text-base font-semibold text-red-700 md:col-span-2"
        >
          Delete tournament
        </button>
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
        open={confirmDelete}
        title="Delete this tournament?"
        onClose={() => setConfirmDelete(false)}
      >
        <p className="mb-4 text-lg">
          {t.name} and its team list are removed for everyone on the team. Your games aren&apos;t
          touched.
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
                router.push("/tournaments");
              })()
            }
            className="h-14 rounded-xl bg-red-700 text-lg font-bold text-white"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </div>,
  );
}
