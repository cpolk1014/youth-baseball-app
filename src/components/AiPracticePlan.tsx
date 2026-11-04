"use client";

import { useState } from "react";
import { importSchedule } from "@/lib/data/store";
import type { AppData, Practice } from "@/lib/data/types";
import { playById } from "@/lib/plays/library";
import {
  MAX_PLANNED,
  applyPlan,
  practiceLength,
  type PlannedPractice,
  type SeasonPlan,
} from "@/lib/practice/aiPlan";
import { formatPracticeWhen } from "@/lib/practice/format";

const heading = "text-sm font-bold tracking-wide text-slate-600 uppercase";
const goalsKey = (teamId: string) => `rallycap:practice-goals:${teamId}`;

const EXAMPLE =
  "This is a development league for 6-7 year olds. Maximize reps for every player at every position. Most important: the fundamentals of how to play baseball and how to be a great teammate; hitting and fielding second. Keep practices upbeat and fast-paced with changing drills. Build in fun competition where no kid feels like they lost.";

type Step =
  | { kind: "ask" }
  | { kind: "planning"; count: number }
  | { kind: "review"; plan: SeasonPlan }
  | { kind: "done"; count: number };

/**
 * Coaches describe their goals for the season and Claude plans every upcoming practice
 * (drills fitted to each practice's length, plays to walk through, a theme and a teammate
 * note). Nothing is saved until the coach reviews it.
 */
export function AiPracticePlan({
  data,
  upcoming,
  onClose,
}: {
  data: AppData;
  /** Upcoming practices, soonest first (canceled ones are left out here). */
  upcoming: Practice[];
  onClose: () => void;
}) {
  const open = upcoming.filter((p) => !p.canceled);
  const empty = open.filter((p) => p.plan.length === 0);
  const [onlyEmpty, setOnlyEmpty] = useState(empty.length > 0 && empty.length < open.length);
  const [goals, setGoals] = useState(() => {
    try {
      return window.localStorage.getItem(goalsKey(data.team.id)) ?? "";
    } catch {
      return "";
    }
  });
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [error, setError] = useState<string | null>(null);
  const chosen = (onlyEmpty ? empty : open).slice(0, MAX_PLANNED);
  const extra = (onlyEmpty ? empty : open).length - chosen.length;

  const plan = async () => {
    if (!goals.trim()) {
      setError("Tell RallyCap what you want from practice this season.");
      return;
    }
    try {
      window.localStorage.setItem(goalsKey(data.team.id), goals);
    } catch {
      // Private mode: it just isn't remembered.
    }
    setError(null);
    setStep({ kind: "planning", count: chosen.length });
    try {
      const res = await fetch("/api/practice/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: data.team.id,
          goals,
          practiceIds: chosen.map((p) => p.id),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as SeasonPlan & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't plan practices. Try again.");
      if (json.practices.length === 0) throw new Error("No plans came back. Try again.");
      setStep({ kind: "review", plan: json });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: "ask" });
    }
  };

  if (step.kind === "planning") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">
          Planning {step.count} practice{step.count === 1 ? "" : "s"}…
        </p>
        <p className="text-base text-slate-600">This can take a minute or two.</p>
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white" role="status">
          Planned {step.count} practice{step.count === 1 ? "" : "s"}.
        </p>
        <p className="text-base text-slate-700">
          Open any practice to change a drill, swap the order or add your own notes.
        </p>
        <button
          onClick={onClose}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  if (step.kind === "review") {
    return (
      <Review
        plan={step.plan}
        practices={chosen}
        onBack={() => setStep({ kind: "ask" })}
        onSaved={(n) => setStep({ kind: "done", count: n })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Tell RallyCap about your team and what matters most this season. It plans each practice:
        drills that fit the practice&apos;s time, plays to walk through, a theme, and a teammate
        lesson. You review everything before it&apos;s saved.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Your goals for the season</span>
        <textarea
          value={goals}
          onChange={(e) => {
            setGoals(e.target.value);
            setError(null);
          }}
          rows={7}
          maxLength={4000}
          placeholder={EXAMPLE}
          className="rounded-xl border-2 border-slate-300 bg-white p-3 text-base leading-snug focus:border-[var(--team)] focus:outline-none"
        />
      </label>
      {!goals && (
        <button
          type="button"
          onClick={() => setGoals(EXAMPLE)}
          className="-mt-2 self-start text-sm font-semibold text-[var(--team)] underline"
        >
          Start from the example
        </button>
      )}
      {empty.length > 0 && empty.length < open.length && (
        <div role="radiogroup" aria-label="Which practices" className="flex flex-col gap-2">
          {(
            [
              [true, `Only practices without drills yet (${empty.length})`],
              [false, `All upcoming practices (${open.length}); replaces their drills`],
            ] as const
          ).map(([v, label]) => (
            <label
              key={String(v)}
              className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 ${onlyEmpty === v ? "border-[var(--team)]" : "border-slate-200"} bg-white`}
            >
              <input
                type="radio"
                checked={onlyEmpty === v}
                onChange={() => setOnlyEmpty(v)}
                className="size-5 accent-[var(--team)]"
              />
              <span className="text-base">{label}</span>
            </label>
          ))}
        </div>
      )}
      {extra > 0 && (
        <p className="text-sm text-slate-600">
          Plans the next {MAX_PLANNED}; run it again later for the other {extra}.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <button
        onClick={() => void plan()}
        disabled={chosen.length === 0}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
      >
        ✨ Plan {chosen.length} practice{chosen.length === 1 ? "" : "s"}
      </button>
      <p className="text-sm text-slate-600">
        Your goals and the practice dates and times are sent to Claude (Anthropic&apos;s AI); no
        player names are sent.
      </p>
    </div>
  );
}

function Review({
  plan,
  practices,
  onBack,
  onSaved,
}: {
  plan: SeasonPlan;
  practices: Practice[];
  onBack: () => void;
  onSaved: (count: number) => void;
}) {
  const byId = new Map(practices.map((p) => [p.id, p]));
  const [picked, setPicked] = useState(() => new Set(plan.practices.map((p) => p.practiceId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = plan.practices.filter((p) => picked.has(p.practiceId));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await importSchedule(
        chosen.map((p) => applyPlan(byId.get(p.practiceId)!, p)),
        [],
      );
      onSaved(chosen.length);
    } catch (e) {
      setError(
        `Couldn't save (${e instanceof Error ? e.message : String(e)}). Check your connection and try again.`,
      );
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {plan.seasonNotes && (
        <section className="rounded-xl border-2 border-[var(--team)] bg-white p-3">
          <h3 className={heading}>The season</h3>
          <p className="mt-1 text-base leading-snug">{plan.seasonNotes}</p>
        </section>
      )}
      <div className="flex items-center justify-between">
        <h3 className={heading}>
          Practices ({chosen.length} of {plan.practices.length})
        </h3>
        <button
          onClick={() =>
            setPicked(
              chosen.length === plan.practices.length
                ? new Set()
                : new Set(plan.practices.map((p) => p.practiceId)),
            )
          }
          className="h-10 px-2 text-sm font-semibold underline"
        >
          {chosen.length === plan.practices.length ? "Uncheck all" : "Check all"}
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {plan.practices.map((p) => (
          <PlannedCard
            key={p.practiceId}
            planned={p}
            practice={byId.get(p.practiceId)!}
            checked={picked.has(p.practiceId)}
            onToggle={() =>
              setPicked((s) => {
                const next = new Set(s);
                if (next.has(p.practiceId)) next.delete(p.practiceId);
                else next.add(p.practiceId);
                return next;
              })
            }
          />
        ))}
      </ul>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onBack}
          disabled={saving}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={() => void save()}
          disabled={saving || chosen.length === 0}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : `Save ${chosen.length} practice${chosen.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function PlannedCard({
  planned,
  practice,
  checked,
  onToggle,
}: {
  planned: PlannedPractice;
  practice: Practice;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const minutes = planned.plan.reduce((n, d) => n + d.minutes, 0);
  const replaces = practice.plan.length > 0;
  return (
    <li
      className={`rounded-xl border-2 bg-white p-3 ${checked ? "border-[var(--team)]" : "border-slate-200 opacity-70"}`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 size-6 shrink-0 accent-[var(--team)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{formatPracticeWhen(practice)}</span>
          <span className="block text-base">
            {[planned.focus, planned.theme].filter(Boolean).join(" · ") || "Practice"}
          </span>
          <span className="block text-sm text-slate-600">
            {planned.plan.length} drills · {minutes} of {practiceLength(practice)} min
            {replaces && " · replaces its drills"}
          </span>
        </span>
      </label>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 h-10 text-sm font-semibold text-[var(--team)] underline"
      >
        {open ? "Hide the plan" : "See the plan"}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-2">
          <ol className="flex flex-col gap-1.5">
            {planned.plan.map((d) => (
              <li key={d.id} className="rounded-lg bg-slate-50 p-2 text-base">
                <span className="font-semibold">{d.title}</span>
                <span className="text-slate-600"> · {d.minutes} min</span>
                {d.notes && <span className="block text-sm text-slate-700">{d.notes}</span>}
              </li>
            ))}
          </ol>
          {planned.plays.length > 0 && (
            <p className="text-sm text-slate-700">
              <b>Plays:</b> {planned.plays.map((id) => playById(id)?.name ?? id).join(", ")}
            </p>
          )}
          {planned.coachNote && (
            <p className="text-sm text-slate-700">
              <b>Coach note:</b> {planned.coachNote}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
