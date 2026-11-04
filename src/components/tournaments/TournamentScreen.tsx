"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Tournament, TournamentTeam } from "@/lib/data/tournament-backend";
import { permissionsFor } from "@/lib/data/permissions";
import { useAppData, useStoreState } from "@/lib/data/store";
import { newTeams, pickDivision, teamKey } from "@/lib/tournaments/event";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { ScreenshotButton, readTournament } from "./AddTournament";
import { tournamentWhen } from "./TournamentsScreen";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/tournament-backend");

/** One tournament: its details and the teams in our division, kept up to date weekly. */
export function TournamentScreen({ id }: { id: string }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const router = useRouter();
  const [t, setT] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const r = await (await backend()).getTournament(id);
    if (!r) setMissing(true);
    else {
      setT(r.tournament);
      setTeams(r.teams);
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

  const checkNow = () =>
    run("Checking the event page…", async () => {
      const res = await fetch("/api/tournaments/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: t.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { note?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't check right now.");
      return json.note;
    });

  const fromScreenshot = (file: File) =>
    run("Reading the screenshot…", async () => {
      const { event } = await readTournament(data.team.id, { file });
      const division =
        event.divisions.find((d) => teamKey(d.name) === teamKey(t.division ?? "")) ??
        event.divisions.find(
          (d) => d.name === pickDivision(event.divisions, t.division ?? data.team.ageGroup),
        ) ??
        (event.divisions.length === 1 ? event.divisions[0] : undefined);
      if (!division) return "No teams for this division were found in that screenshot.";
      const fresh = newTeams(teams, division.teams);
      await (await backend()).addTeams(t.id, fresh, "screenshot");
      return fresh.length
        ? `${fresh.length} team${fresh.length === 1 ? "" : "s"} added.`
        : "No new teams in that screenshot.";
    });

  const ours = teams.find((x) => x.isUs);
  const others = teams.filter((x) => !x.isUs);
  const checked = t.checkedAt
    ? new Date(t.checkedAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const stillChecking = !!t.url && (!t.startDate || t.startDate > today);

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
        {t.url && (
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-semibold text-[var(--team)] underline"
          >
            Open the event page
          </a>
        )}
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
          {stillChecking
            ? `We check the event page every Monday for new teams until the tournament starts.${checked ? ` Last checked ${checked}${t.checkNote ? `: ${t.checkNote}` : "."}` : ""}`
            : t.url
              ? "The tournament has started, so the weekly check has stopped."
              : "Added from a screenshot. Add another screenshot when more teams sign up."}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Schedule, scores and standings come next: the pool schedule and bracket from a screenshot.
        </p>
      </section>

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
                    {x.source === "weekly" && " · added by the weekly check"}
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
            {t.url && (
              <button
                onClick={() => void checkNow()}
                disabled={busy !== null}
                className="h-12 rounded-xl bg-[var(--team)] text-base font-bold text-white disabled:opacity-40"
              >
                Check for new teams now
              </button>
            )}
            <ScreenshotButton
              onFile={(f) => void fromScreenshot(f)}
              label="Add teams from a screenshot"
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
