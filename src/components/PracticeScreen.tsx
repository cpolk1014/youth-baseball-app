"use client";

import { useState } from "react";
import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import { deletePractice, newId, savePractice, useAppData } from "@/lib/data/store";
import type { Practice } from "@/lib/data/types";
import { DRILL_LIBRARY } from "@/lib/practice/drills";
import { formatPracticeWhen } from "@/lib/practice/format";
import { movePlanItem, planMinutes, practiceMinutes, type PlanItem } from "@/lib/practice/schedule";
import { quizLength } from "@/lib/plays/homework";
import { playsFor } from "@/lib/plays/library";
import { AppShell, Loading } from "./AppShell";
import { PlayPicker } from "./PlayPicker";
import { PracticeForm } from "./PracticeForms";
import { QuizButton, quizNames } from "./QuizButton";
import { Sheet } from "./Sheet";

type Panel = "edit" | "drills" | "copy" | "plays" | "delete" | null;

const small =
  "flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-lg font-bold active:bg-slate-100 disabled:opacity-30";

export function PracticeScreen({ practiceId }: { practiceId: string }) {
  const data = useAppData();
  const [panel, setPanel] = useState<Panel>(null);

  if (!data) {
    return (
      <AppShell title="Practice" backHref="/practices" tab="practice">
        <Loading />
      </AppShell>
    );
  }
  const practice = data.practices.find((p) => p.id === practiceId);
  if (!practice) {
    return (
      <AppShell title="Practice not found" backHref="/practices" tab="practice">
        <p className="text-lg">This practice doesn&apos;t exist anymore.</p>
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const save = (changes: Partial<Practice>) => savePractice({ ...practice, ...changes });
  const setPlan = (plan: PlanItem[]) => save({ plan });
  const planned = planMinutes(practice.plan);
  const scheduled = practiceMinutes(practice.startTime, practice.endTime);
  const situations = playsFor(practice.plays);
  const others = data.practices
    .filter((p) => p.id !== practice.id && p.plan.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <AppShell
      title={formatPracticeWhen(practice)}
      subtitle={practice.location ?? "Practice"}
      backHref="/practices"
      tab="practice"
    >
      {practice.canceled && (
        <p className="mb-3 rounded-xl bg-red-700 p-3 text-base font-bold text-white">
          This practice is canceled.
        </p>
      )}

      <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-600">Focus</p>
            <p className="text-lg font-bold">{practice.focus ?? "Not set"}</p>
            {practice.location && (
              <p className="mt-1 text-base text-slate-700">{practice.location}</p>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => setPanel("edit")}
              className="h-11 shrink-0 rounded-lg border-2 border-slate-400 px-3 text-base font-bold active:bg-slate-100"
            >
              Edit
            </button>
          )}
        </div>
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">
            Practice plan
          </h2>
          <span
            className={`text-sm font-bold ${scheduled !== null && planned > scheduled ? "text-red-700" : "text-slate-600"}`}
          >
            {planned} min{scheduled !== null ? ` of ${scheduled}` : ""}
          </span>
        </div>

        {practice.plan.length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            {canEdit
              ? "No drills yet. Add some from the library or copy another practice's plan."
              : "No plan yet."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {practice.plan.map((item, i) => (
              <li key={item.id} className="rounded-xl border-2 border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <span className="w-6 shrink-0 pt-0.5 text-base font-bold text-slate-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug font-semibold">{item.title}</p>
                    {item.notes && <p className="text-sm text-slate-600">{item.notes}</p>}
                  </div>
                  {!canEdit && (
                    <span className="shrink-0 text-base font-bold">{item.minutes} min</span>
                  )}
                </div>
                {canEdit && (
                  <div className="mt-2 flex items-center gap-2 pl-8">
                    <button
                      aria-label={`Less time for ${item.title}`}
                      disabled={item.minutes <= 5}
                      onClick={() =>
                        setPlan(
                          practice.plan.map((x) =>
                            x.id === item.id ? { ...x, minutes: x.minutes - 5 } : x,
                          ),
                        )
                      }
                      className={small}
                    >
                      −
                    </button>
                    <span className="w-16 text-center text-base font-bold whitespace-nowrap">
                      {item.minutes} min
                    </span>
                    <button
                      aria-label={`More time for ${item.title}`}
                      disabled={item.minutes >= 120}
                      onClick={() =>
                        setPlan(
                          practice.plan.map((x) =>
                            x.id === item.id ? { ...x, minutes: x.minutes + 5 } : x,
                          ),
                        )
                      }
                      className={small}
                    >
                      +
                    </button>
                    <span className="flex-1" />
                    <button
                      aria-label={`Move ${item.title} up`}
                      disabled={i === 0}
                      onClick={() => setPlan(movePlanItem(practice.plan, i, -1))}
                      className={small}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${item.title} down`}
                      disabled={i === practice.plan.length - 1}
                      onClick={() => setPlan(movePlanItem(practice.plan, i, 1))}
                      className={small}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remove ${item.title}`}
                      onClick={() => setPlan(practice.plan.filter((x) => x.id !== item.id))}
                      className={`${small} text-red-700`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {canEdit && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setPanel("drills")}
              className="h-12 rounded-xl bg-green-700 text-base font-bold text-white active:bg-green-800"
            >
              + Add drill
            </button>
            <button
              onClick={() => setPanel("copy")}
              disabled={others.length === 0}
              className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100 disabled:opacity-40"
            >
              Copy a plan
            </button>
          </div>
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          Situations to work on
        </h2>
        {situations.length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            {canEdit
              ? "Pick plays from the library to walk through, like bunt defense or cutoffs."
              : "None picked."}
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {situations.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/plays/${p.id}`}
                  className="flex h-full min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-base leading-snug font-semibold">{p.name}</span>
                    <span className="block text-sm text-slate-600">{p.situation}</span>
                  </span>
                  <span aria-hidden="true" className="text-2xl text-slate-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className={`mt-3 grid gap-2 ${canEdit && situations.length ? "grid-cols-2" : ""}`}>
          {canEdit && (
            <button
              onClick={() => setPanel("plays")}
              className="h-12 rounded-xl bg-green-700 text-base font-bold text-white active:bg-green-800"
            >
              {situations.length ? "Change plays" : "+ Add plays"}
            </button>
          )}
          {situations.length > 0 && (
            <QuizButton
              plays={situations}
              count={quizLength(situations.length)}
              playerNames={quizNames(data)}
              title="Team quiz"
              className="h-12 rounded-xl bg-[#c8352e] text-base font-bold text-white active:bg-[#a92a24]"
            >
              Team quiz
            </QuizButton>
          )}
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">Notes</h2>
        {canEdit ? (
          <textarea
            defaultValue={practice.notes ?? ""}
            key={practice.id}
            maxLength={2000}
            rows={3}
            placeholder="Bring catcher's gear, extra helmets…"
            onBlur={(e) => {
              const notes = e.target.value.trim() || null;
              if (notes !== practice.notes) save({ notes });
            }}
            className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base focus:border-[var(--team)] focus:outline-none"
          />
        ) : (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-3 text-base whitespace-pre-wrap">
            {practice.notes ?? "None."}
          </p>
        )}
      </section>

      {canEdit && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => save({ canceled: !practice.canceled })}
            className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
          >
            {practice.canceled ? "Restore practice" : "Cancel practice"}
          </button>
          <button
            onClick={() => setPanel("delete")}
            className="h-12 text-base font-semibold text-red-700 underline"
          >
            Delete practice
          </button>
        </div>
      )}

      <Sheet open={panel === "edit"} title="Edit practice" onClose={() => setPanel(null)}>
        {panel === "edit" && (
          <PracticeForm
            practice={practice}
            onCancel={() => setPanel(null)}
            onSave={(p) => {
              savePractice(p);
              setPanel(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={panel === "drills"} title="Add a drill" onClose={() => setPanel(null)}>
        {panel === "drills" && (
          <DrillPicker
            onAdd={(item) => {
              setPlan([...practice.plan, { ...item, id: newId() }]);
              setPanel(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={panel === "copy"} title="Copy a plan" onClose={() => setPanel(null)}>
        <p className="mb-3 text-base text-slate-700">
          {practice.plan.length
            ? "Replaces this practice's plan with the one you pick."
            : "Pick a practice to copy its drills."}
        </p>
        <ul className="flex flex-col gap-2">
          {others.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setPlan(p.plan.map((x) => ({ ...x, id: newId() })));
                  setPanel(null);
                }}
                className="w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
              >
                <span className="block text-base font-bold">{formatPracticeWhen(p)}</span>
                <span className="block text-sm text-slate-600">
                  {p.focus ? `${p.focus} · ` : ""}
                  {p.plan.length} drills · {planMinutes(p.plan)} min
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={panel === "plays"} title="Situations to work on" onClose={() => setPanel(null)}>
        {panel === "plays" && (
          <>
            <PlayPicker selected={practice.plays} onChange={(plays) => save({ plays })} />
            <button
              onClick={() => setPanel(null)}
              className="sticky bottom-0 mt-4 h-14 w-full rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
            >
              Done
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={panel === "delete"} title="Delete this practice?" onClose={() => setPanel(null)}>
        <p className="mb-4 text-lg">
          {formatPracticeWhen(practice)} and its plan will be removed. To keep it on the schedule as
          canceled instead, use Cancel practice.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setPanel(null)}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Keep it
          </button>
          <button
            onClick={() => {
              deletePractice(practice.id);
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- leave the deleted page
              window.location.assign("/practices");
            }}
            className="h-14 flex-1 rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}

function DrillPicker({ onAdd }: { onAdd: (item: Omit<PlanItem, "id">) => void }) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(10);
  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onAdd({ title: title.trim(), minutes });
        }}
        className="flex flex-col gap-2 rounded-xl bg-slate-100 p-3"
      >
        <span className="text-sm font-semibold text-slate-700">Your own drill</span>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="e.g. Hit the cone"
            className="h-12 min-w-0 flex-1 rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
          <select
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-12 rounded-lg border-2 border-slate-400 bg-white px-2 text-base font-semibold"
          >
            {[5, 10, 15, 20, 25, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-12 rounded-lg bg-[var(--team)] text-base font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {DRILL_LIBRARY.map((group) => (
        <section key={group.category}>
          <h3 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            {group.category}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.drills.map((d) => (
              <li key={d.title}>
                <button
                  onClick={() =>
                    onAdd({ title: d.title, minutes: d.minutes, notes: d.description })
                  }
                  className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">{d.title}</span>
                    <span className="block text-sm text-slate-600">{d.description}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-slate-700">{d.minutes} min</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
