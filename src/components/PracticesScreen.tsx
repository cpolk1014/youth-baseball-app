"use client";

import Link from "next/link";
import { useState } from "react";
import { localDateString } from "@/lib/data/game";
import { permissionsFor } from "@/lib/data/permissions";
import { addPractices, newId, savePractice, useAppData, useStoreState } from "@/lib/data/store";
import type { Practice } from "@/lib/data/types";
import { formatPracticeWhen } from "@/lib/practice/format";
import { planMinutes } from "@/lib/practice/schedule";
import { AppShell, Loading } from "./AppShell";
import { ImportSchedule } from "./ImportSchedule";
import { PracticeForm, ScheduleBuilder } from "./PracticeForms";
import { Sheet } from "./Sheet";

export function PracticesScreen() {
  const data = useAppData();
  const [adding, setAdding] = useState<Practice | null>(null);
  const [building, setBuilding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [importing, setImporting] = useState(false);
  const { mode } = useStoreState();

  if (!data) {
    return (
      <AppShell title="Practices" tab="practice">
        <Loading />
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
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
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
          >
            + Add
          </button>
        ) : undefined
      }
    >
      {canEdit && (
        <button
          onClick={() => setBuilding(true)}
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl bg-[#0b1f3a] px-4 py-2 text-left text-white active:bg-[#16325a]"
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
          className="mb-4 flex min-h-14 w-full flex-col items-start justify-center rounded-xl border-2 border-[#0b1f3a] bg-white px-4 py-2 text-left active:bg-slate-50"
        >
          <span className="text-lg font-bold text-[#0b1f3a]">Import from a file</span>
          <span className="text-sm text-slate-600">
            Photo, PDF or CSV of your schedule: practices and games.
          </span>
        </button>
      )}

      {upcoming.length === 0 ? (
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
            onCancel={() => setAdding(null)}
            onSave={(p) => {
              savePractice(p);
              setAdding(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={importing} title="Import a schedule" onClose={() => setImporting(false)}>
        {importing && <ImportSchedule data={data} onClose={() => setImporting(false)} />}
      </Sheet>

      <Sheet open={building} title="Build season schedule" onClose={() => setBuilding(false)}>
        {building && (
          <ScheduleBuilder
            seasonId={data.season.id}
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
        {p.location && <p className="text-base text-slate-700">{p.location}</p>}
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {p.plan.length
            ? `${p.plan.length} drill${p.plan.length === 1 ? "" : "s"} · ${minutes} min planned`
            : "No plan yet"}
        </p>
      </Link>
    </li>
  );
}
