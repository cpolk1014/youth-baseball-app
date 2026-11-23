"use client";

import { EmptyState } from "./EmptyState";
import { PaidGate } from "./paywall";
import Link from "next/link";
import { useState } from "react";
import { localDateString, placeLabel, recentPlaces } from "@/lib/data/game";
import { permissionsFor } from "@/lib/data/permissions";
import {
  addPractices,
  importSchedule,
  newId,
  savePractice,
  useAppData,
  useStoreState,
} from "@/lib/data/store";
import { clearPlan, hasPlan } from "@/lib/practice/aiPlan";
import { toast } from "./shell/Toast";
import { CalendarButton } from "./CalendarButton";
import type { Practice } from "@/lib/data/types";
import { formatPracticeWhen } from "@/lib/practice/format";
import { planMinutes } from "@/lib/practice/schedule";
import { AppShell, Loading } from "./AppShell";
import { AiPracticePlan } from "./AiPracticePlan";
import { ImportSchedule } from "./ImportSchedule";
import { PracticeForm, ScheduleBuilder } from "./PracticeForms";
import { Sheet } from "./Sheet";

export function PracticesScreen() {
  const data = useAppData();
  const [adding, setAdding] = useState<Practice | null>(null);
  const [building, setBuilding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [importing, setImporting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { mode } = useStoreState();

  if (!data) {
    return (
      <AppShell title="Practices" tab="practice">
        <Loading />
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role).editTeam;
  const today = localDateString(new Date());
  const sorted = [...data.practices].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
  const upcoming = sorted.filter((p) => p.date >= today);
  const past = sorted.filter((p) => p.date < today).reverse();
  const startAdd = () =>
    setAdding({
      id: newId(),
      seasonId: data.season.id,
      date: today,
      startTime: "18:00",
      endTime: "19:30",
      location: null,
      focus: null,
      notes: null,
      plan: [],
      canceled: false,
      plays: [],
    });

  return (
    <AppShell
      title="Practices"
      subtitle={`${data.team.name} · ${data.season.name}`}
      tab="practice"
      action={
        canEdit ? (
          <button
            onClick={startAdd}
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
          >
            + Add
          </button>
        ) : undefined
      }
    >
      {canEdit && (
        <button
          onClick={() => setBuilding(true)}
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl bg-[var(--team)] px-4 py-2 text-left text-white active:bg-[var(--team-press)]"
        >
          <span className="text-lg font-bold">Build season schedule</span>
          <span className="text-sm text-white/80">
            Pick practice days and dates; we add them all.
          </span>
        </button>
      )}
      {canEdit && mode === "supabase" && (
        <button
          onClick={() => setImporting(true)}
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl border-2 border-[var(--team)] bg-white px-4 py-2 text-left active:bg-slate-50"
        >
          <span className="text-lg font-bold text-[var(--team)]">Import from a file</span>
          <span className="text-sm text-slate-600">
            Photo, PDF or CSV of your schedule: practices and games.
          </span>
        </button>
      )}

      {canEdit && mode === "supabase" && upcoming.some((p) => !p.canceled) && (
        <button
          onClick={() => setPlanning(true)}
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl border-2 border-[var(--team)] bg-white px-4 py-2 text-left active:bg-slate-50"
        >
          <span className="text-lg font-bold text-[var(--team)]">✨ Plan practices with AI</span>
          <span className="text-sm text-slate-600">
            Describe your goals; get drills and plays for every practice.
          </span>
        </button>
      )}

      {canEdit && sorted.some(hasPlan) && (
        <button
          onClick={() => setClearing(true)}
          className="mb-4 -mt-2 h-10 text-sm font-semibold text-red-700 underline"
        >
          Remove practice plans…
        </button>
      )}

      {sorted.length > 0 && (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <CalendarButton
            practices={upcoming}
            teamName={data.team.name}
            timezone={data.team.gameDay?.timezone}
          />
          <Link
            href="/practices/print"
            className="flex h-11 items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-bold text-slate-800 active:bg-slate-100"
          >
            <span aria-hidden="true">🖨️</span> Print schedule
          </Link>
        </div>
      )}

      {sorted.length === 0 ? (
        canEdit ? (
          <EmptyState icon="🏟️" title="Set up your practices">
            Tap <b>Build season schedule</b> above: pick your practice days and dates, and Fungo
            adds every one. Then plan drills by hand
            {mode === "supabase" ? " or let AI plan the whole season from your goals" : ""}.
            Families see when and where, with directions and weather.
          </EmptyState>
        ) : (
          <EmptyState icon="🏟️" title="No practices yet">
            When the coaches add practices, you&apos;ll see each one here with the time, place,
            directions and weather, and you can add them all to your calendar.
          </EmptyState>
        )
      ) : upcoming.length === 0 ? (
        <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
          {canEdit
            ? "No upcoming practices. Build the season schedule or add one."
            : "No upcoming practices yet."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {upcoming.map((p) => (
            <PracticeCard key={p.id} practice={p} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <section className="mt-6">
          <button
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="mb-2 flex h-11 w-full items-center justify-between text-sm font-bold tracking-wide text-slate-600 uppercase"
          >
            Past practices ({past.length})
            <span aria-hidden="true">{showPast ? "Hide" : "Show"}</span>
          </button>
          {showPast && (
            <ul className="grid gap-3 opacity-80 md:grid-cols-2">
              {past.map((p) => (
                <PracticeCard key={p.id} practice={p} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={adding !== null} title="Add practice" onClose={() => setAdding(null)}>
        {adding && (
          <PracticeForm
            practice={adding}
            recentPlaces={recentPlaces([...data.games, ...data.practices])}
            onCancel={() => setAdding(null)}
            onSave={(p) => {
              savePractice(p);
              setAdding(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={importing} title="Import a schedule" onClose={() => setImporting(false)}>
        {importing && (
          <PaidGate feature="Schedule import">
            <ImportSchedule data={data} onClose={() => setImporting(false)} />
          </PaidGate>
        )}
      </Sheet>

      <Sheet open={planning} title="Plan practices with AI" onClose={() => setPlanning(false)}>
        {planning && (
          <PaidGate feature="AI practice plans">
            <AiPracticePlan data={data} upcoming={upcoming} onClose={() => setPlanning(false)} />
          </PaidGate>
        )}
      </Sheet>

      <Sheet open={clearing} title="Remove practice plans" onClose={() => setClearing(false)}>
        {clearing && (
          <RemovePlans upcoming={upcoming} all={sorted} onDone={() => setClearing(false)} />
        )}
      </Sheet>

      <Sheet open={building} title="Build season schedule" onClose={() => setBuilding(false)}>
        {building && (
          <ScheduleBuilder
            seasonId={data.season.id}
            recentPlaces={recentPlaces([...data.games, ...data.practices])}
            existingDates={new Set(data.practices.map((p) => p.date))}
            newId={newId}
            onCancel={() => setBuilding(false)}
            onCreate={(list) => {
              addPractices(list);
              setBuilding(false);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function PracticeCard({ practice: p }: { practice: Practice }) {
  const minutes = planMinutes(p.plan);
  return (
    <li>
      <Link
        href={`/practices/${p.id}`}
        className={`block h-full rounded-xl border-2 bg-white p-4 active:bg-slate-50 ${
          p.canceled ? "border-dashed border-slate-300" : "border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={`text-lg font-bold ${p.canceled ? "text-slate-500 line-through" : ""}`}>
            {formatPracticeWhen(p)}
          </p>
          {p.canceled ? (
            <span className="shrink-0 rounded-full bg-red-700 px-3 py-1 text-sm font-bold text-white">
              Canceled
            </span>
          ) : p.focus ? (
            <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-950">
              {p.focus}
            </span>
          ) : null}
        </div>
        {placeLabel(p) && <p className="text-base text-slate-700">{placeLabel(p)}</p>}
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {p.plan.length
            ? `${p.plan.length} drill${p.plan.length === 1 ? "" : "s"} · ${minutes} min planned`
            : "No plan yet"}
        </p>
      </Link>
    </li>
  );
}

/**
 * Take the plans off practices (upcoming, or the whole season) to start over, e.g. before
 * running AI practice plans again with new goals. Undo puts them back.
 */
function RemovePlans({
  upcoming,
  all,
  onDone,
}: {
  upcoming: Practice[];
  all: Practice[];
  onDone: () => void;
}) {
  const [range, setRange] = useState<"upcoming" | "season">("upcoming");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = (range === "upcoming" ? upcoming : all).filter(hasPlan);
  const remove = async () => {
    setBusy(true);
    setError(null);
    const before = targets;
    try {
      await importSchedule(before.map(clearPlan), []);
      toast(`Removed plans from ${before.length} practice${before.length === 1 ? "" : "s"}`, {
        label: "Undo",
        run: () => void importSchedule(before, []),
      });
      onDone();
    } catch (e) {
      setError(
        `Couldn't remove them (${e instanceof Error ? e.message : String(e)}). Check your connection and try again.`,
      );
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Takes off each practice&apos;s drills, plays, focus and the AI&apos;s themes, so you can
        plan them again (say, with new goals). Dates, times, places and your own notes stay.
      </p>
      <div role="radiogroup" aria-label="Which practices" className="flex flex-col gap-2">
        {(
          [
            ["upcoming", "Upcoming practices", upcoming.filter(hasPlan).length],
            ["season", "The whole season, past ones too", all.filter(hasPlan).length],
          ] as const
        ).map(([value, label, n]) => (
          <label
            key={value}
            className={`flex min-h-12 items-center gap-3 rounded-xl border-2 bg-white px-3 ${range === value ? "border-[var(--team)]" : "border-slate-200"}`}
          >
            <input
              type="radio"
              checked={range === value}
              onChange={() => setRange(value)}
              className="size-5 accent-[var(--team)]"
            />
            <span className="text-base">
              {label} ({n} with plans)
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <button
        onClick={() => void remove()}
        disabled={busy || targets.length === 0}
        className="h-14 rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800 disabled:opacity-40"
      >
        {busy
          ? "Removing…"
          : `Remove plans from ${targets.length} practice${targets.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
