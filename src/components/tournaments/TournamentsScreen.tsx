"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Tournament } from "@/lib/data/tournament-backend";
import { permissionsFor } from "@/lib/data/permissions";
import { useAppData, useStoreState } from "@/lib/data/store";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { AddTournament } from "./AddTournament";

export function tournamentWhen(t: Pick<Tournament, "startDate" | "endDate">): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!t.startDate) return "Dates TBD";
  return t.endDate && t.endDate !== t.startDate
    ? `${fmt(t.startDate)} – ${fmt(t.endDate)}`
    : fmt(t.startDate);
}

/** The team's tournaments, soonest first; coaches add one from its event link. */
export function TournamentsScreen() {
  const data = useAppData();
  const { mode } = useStoreState();
  const router = useRouter();
  const [list, setList] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const teamId = data?.team.id;

  useEffect(() => {
    if (!teamId || mode !== "supabase") return;
    let current = true;
    import("@/lib/data/tournament-backend")
      .then((m) => m.listTournaments(teamId))
      .then(
        (l) => current && setList(l),
        (e: unknown) => current && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      current = false;
    };
  }, [teamId, mode]);

  const shell = (children: React.ReactNode, action?: React.ReactNode) => (
    <AppShell title="Tournaments" subtitle={data?.team.name} tab="tournaments" action={action}>
      {children}
    </AppShell>
  );
  if (!data) return shell(<Loading />);
  if (mode !== "supabase") return shell(<p className="text-lg">Tournaments need sign-in.</p>);
  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (list ?? []).filter((t) => !t.endDate || t.endDate >= today);
  const past = (list ?? []).filter((t) => t.endDate && t.endDate < today).reverse();

  return shell(
    <>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900"
        >
          {error}
        </p>
      )}
      {canEdit && (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl bg-[var(--team)] px-4 py-2 text-left text-white active:bg-[var(--team-press)]"
        >
          <span className="text-lg font-bold">+ Add a tournament</span>
          <span className="text-sm text-white/80">
            From a screenshot of the event; we add the teams.
          </span>
        </button>
      )}
      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
          {canEdit
            ? "No tournaments yet. Add one as soon as you register, even months ahead."
            : "No tournaments yet."}
        </p>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {upcoming.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </ul>
          {past.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
                Past
              </h2>
              <ul className="grid gap-3 opacity-80 md:grid-cols-2">
                {past.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Sheet open={adding} title="Add a tournament" onClose={() => setAdding(false)}>
        {adding && (
          <AddTournament
            data={data}
            onSaved={(id) => {
              setAdding(false);
              router.push(`/tournaments/${id}`);
            }}
          />
        )}
      </Sheet>
    </>,
    canEdit ? (
      <button
        onClick={() => setAdding(true)}
        className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
      >
        + Add
      </button>
    ) : undefined,
  );
}

function TournamentCard({ t }: { t: Tournament }) {
  return (
    <li>
      <Link
        href={`/tournaments/${t.id}`}
        className="block h-full rounded-xl border-2 border-slate-200 bg-white p-4 active:bg-slate-50"
      >
        <p className="text-sm font-semibold text-slate-600">
          {tournamentWhen(t)}
          {t.city ? ` · ${t.city}` : ""}
        </p>
        <p className="mt-0.5 text-xl font-bold">{t.name}</p>
        <p className="text-base text-slate-700">
          {[t.organization, t.division, `${t.teamCount} team${t.teamCount === 1 ? "" : "s"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Link>
    </li>
  );
}
