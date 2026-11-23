"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NEXT_STATUS,
  SECTIONS,
  dueText,
  goals,
  readScoreboard,
  readTasks,
  sectionTasks,
  taskTotals,
  type Goal,
  type Task,
  type TaskSection,
  type TaskStatus,
} from "@/lib/admin/plan";
import { getBrowserSupabase } from "@/lib/supabase/client";

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const h2 = "text-sm font-bold tracking-wide text-slate-600 uppercase";
const COLS = "id,section,title,detail,due_week,status,notes,done_at,sort";
const ROAD_URL = "https://claude.ai/artifact/A9YkpVPX7tBACHDkJu4oYB";
const MARKETING_URL =
  "https://github.com/cpolk1014/youth-baseball-app/blob/main/docs/marketing/marketing-plan.md";

/** The Plan tab: the targets from both plans, measured, and the to-do list to work through. */
export function PlanTab() {
  const [board, setBoard] = useState<Goal[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    const [b, t] = await Promise.all([
      sb.rpc("admin_scoreboard"),
      sb.from("admin_task").select(COLS).order("sort"),
    ]);
    if (b.error || t.error) {
      setError((b.error ?? t.error)!.message);
      return;
    }
    setBoard(goals(readScoreboard(b.data)));
    setTasks(readTasks(t.data));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this tab's data
    void load();
  }, [load]);

  /** Change a to-do here at once, then in the database; put it back if that fails. */
  const change = async (id: string, patch: Partial<Task>) => {
    const before = tasks;
    setTasks((list) => list?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? null);
    const row: Record<string, unknown> = {};
    if (patch.status) row.status = patch.status;
    if ("notes" in patch) row.notes = patch.notes || null;
    if ("title" in patch) row.title = patch.title;
    if ("dueWeek" in patch) row.due_week = patch.dueWeek || null;
    const { data, error: err } = await getBrowserSupabase()
      .from("admin_task")
      .update(row)
      .eq("id", id)
      .select(COLS)
      .single();
    if (err) {
      setTasks(before);
      setError(err.message);
      return;
    }
    const [fresh] = readTasks([data]);
    setTasks((list) => list?.map((t) => (t.id === id ? fresh! : t)) ?? null);
  };

  const add = async (section: TaskSection, title: string, dueWeek: string | null) => {
    const { data, error: err } = await getBrowserSupabase()
      .from("admin_task")
      .insert({ section, title, due_week: dueWeek, sort: 1000 })
      .select(COLS)
      .single();
    if (err) {
      setError(err.message);
      return false;
    }
    setTasks((list) => [...(list ?? []), ...readTasks([data])]);
    return true;
  };

  const remove = async (id: string) => {
    const { error: err } = await getBrowserSupabase().from("admin_task").delete().eq("id", id);
    if (err) setError(err.message);
    else setTasks((list) => list?.filter((t) => t.id !== id) ?? null);
  };

  if (error && !tasks) {
    return (
      <p role="alert" className={`${card} text-base font-semibold text-red-700`}>
        {error}
      </p>
    );
  }
  if (!board || !tasks) return <p className={`${card} text-base text-slate-600`}>Loading…</p>;
  const totals = taskTotals(tasks);

  return (
    <>
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>Scoreboard</h2>
          <p className="text-sm text-slate-600">
            From{" "}
            <a href={ROAD_URL} target="_blank" rel="noopener noreferrer" className="underline">
              Road to $1M
            </a>{" "}
            and the{" "}
            <a href={MARKETING_URL} target="_blank" rel="noopener noreferrer" className="underline">
              marketing plan
            </a>
            . Measured live; demo clubs left out.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.map((g) => (
            <GoalCard key={g.key} g={g} />
          ))}
        </ul>
      </section>

      <section className={card}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>To do</h2>
          <p className="text-sm text-slate-600">
            {totals.done} of {totals.total} done
            {totals.doing ? ` · ${totals.doing} in progress` : ""}. Tap the box: to do → doing →
            done.
          </p>
        </div>
        <div className="mb-4 h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-[#1baf7a]"
            style={{ width: `${totals.total ? (totals.done / totals.total) * 100 : 0}%` }}
          />
        </div>
        {error && (
          <p role="alert" className="mb-3 text-base font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          {SECTIONS.map((s) => (
            <TaskSectionList
              key={s.key}
              section={s}
              tasks={tasks}
              onChange={change}
              onAdd={add}
              onRemove={remove}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function GoalCard({ g }: { g: Goal }) {
  const p = g.progress;
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-slate-800">{g.label}</p>
        <span className="shrink-0 text-xs text-slate-500">{g.source}</span>
      </div>
      <p className="mt-1 text-2xl font-black tabular-nums">{g.now}</p>
      <p className="text-sm text-slate-600">Target: {g.target}</p>
      <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden="true">
        {p !== null && (
          <div
            className={`h-2 rounded-full ${g.under && p < 0.25 ? "bg-[#e34948]" : "bg-[#2a78d6]"}`}
            style={{ width: `${Math.max(p > 0 ? 2 : 0, p * 100)}%` }}
          />
        )}
      </div>
      {g.note && <p className="mt-1 text-xs text-slate-500">{g.note}</p>}
    </li>
  );
}

const STATUS_LOOK: Record<TaskStatus, { box: string; mark: string; label: string }> = {
  todo: { box: "border-2 border-slate-400 bg-white", mark: "", label: "To do" },
  doing: {
    box: "border-2 border-amber-500 bg-amber-100 text-amber-700",
    mark: "…",
    label: "Doing",
  },
  done: { box: "bg-green-700 text-white", mark: "✓", label: "Done" },
};

function TaskSectionList({
  section,
  tasks,
  onChange,
  onAdd,
  onRemove,
}: {
  section: (typeof SECTIONS)[number];
  tasks: Task[];
  onChange: (id: string, patch: Partial<Task>) => Promise<void>;
  onAdd: (section: TaskSection, title: string, dueWeek: string | null) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { open, done } = sectionTasks(tasks, section.key);
  const [draft, setDraft] = useState("");
  const [week, setWeek] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <h3 className="text-lg font-bold text-slate-900">
        {section.label}{" "}
        <span className="text-sm font-normal text-slate-500">
          {open.length} open · {section.hint}
        </span>
      </h3>
      <ul className="mt-2 flex flex-col">
        {open.map((t) => (
          <TaskRow key={t.id} t={t} today={today} onChange={onChange} onRemove={onRemove} />
        ))}
        {open.length === 0 && <li className="py-2 text-base text-slate-500">All done here.</li>}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const title = draft.trim();
          if (!title) return;
          void onAdd(section.key, title, week || null).then((ok) => {
            if (ok) {
              setDraft("");
              setWeek("");
            }
          });
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 300))}
          placeholder="Add a to-do…"
          aria-label={`Add a to-do to ${section.label}`}
          className="h-11 min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 text-base focus:border-[#1B2A4A] focus:outline-none"
        />
        <input
          type="date"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          aria-label="Due week (optional)"
          className="h-11 w-36 rounded-lg border-2 border-slate-200 px-2 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-11 rounded-lg bg-[#1B2A4A] px-4 text-base font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {done.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer py-1 text-sm font-semibold text-slate-600">
            Done ({done.length})
          </summary>
          <ul className="flex flex-col">
            {done.map((t) => (
              <TaskRow key={t.id} t={t} today={today} onChange={onChange} onRemove={onRemove} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TaskRow({
  t,
  today,
  onChange,
  onRemove,
}: {
  t: Task;
  today: string;
  onChange: (id: string, patch: Partial<Task>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(t.notes ?? "");
  const look = STATUS_LOOK[t.status];
  const due = dueText(t, today);
  return (
    <li className="flex items-start gap-3 border-t border-slate-100 py-2 first:border-0">
      <button
        onClick={() => void onChange(t.id, { status: NEXT_STATUS[t.status] })}
        aria-label={`${t.title}: ${look.label}. Change to ${STATUS_LOOK[NEXT_STATUS[t.status]].label}`}
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-base font-bold ${look.box}`}
      >
        {look.mark}
      </button>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setEditing((v) => !v)}
          className={`block text-left text-base font-semibold ${t.status === "done" ? "text-slate-500 line-through" : "text-slate-900"}`}
        >
          {t.title}
        </button>
        <p className="text-sm text-slate-600">
          {[
            t.status === "doing" ? "Doing" : null,
            due,
            t.status === "done" && t.doneAt
              ? `Done ${new Date(t.doneAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : null,
          ]
            .filter(Boolean)
            .map((x, i) => (
              <span key={i} className={x?.endsWith("late") ? "font-semibold text-red-700" : ""}>
                {i > 0 ? " · " : ""}
                {x}
              </span>
            ))}
        </p>
        {t.notes && !editing && <p className="text-sm text-slate-700 italic">{t.notes}</p>}
        {editing && (
          <div className="mt-1 flex flex-col gap-2">
            {t.detail && <p className="text-sm text-slate-700">{t.detail}</p>}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Notes…"
              aria-label="Notes"
              className="rounded-lg border-2 border-slate-200 px-3 py-2 text-base focus:border-[#1B2A4A] focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void onChange(t.id, { notes }).then(() => setEditing(false))}
                className="h-10 rounded-lg bg-[#1B2A4A] px-4 text-sm font-bold text-white"
              >
                Save notes
              </button>
              <button
                onClick={() => setEditing(false)}
                className="h-10 rounded-lg border-2 border-slate-300 px-4 text-sm font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => void onRemove(t.id)}
                className="ml-auto h-10 rounded-lg px-3 text-sm font-semibold text-red-700 underline"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
