"use client";

import { useState } from "react";
import type { ClubPlan } from "@/lib/data/club-backend";
import { PRACTICE_FOCUSES } from "@/lib/practice/drills";
import { DrillEdit } from "../DrillEdit";
import { DrillPicker } from "../PracticeScreen";

const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const btn = "size-11 shrink-0 rounded-lg border-2 disabled:opacity-30";
const small = `${btn} border-slate-300`;

/** Name, focus and drills (each with minutes and how to run it) of a club practice plan. */
export function ClubPlanEditor({
  plan,
  saveLabel = "Save plan",
  onSave,
  onCancel,
  onDelete,
}: {
  plan: ClubPlan;
  saveLabel?: string;
  onSave: (p: ClubPlan) => void;
  onCancel: () => void;
  /** Shown as "Delete plan" when given. */
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [focus, setFocus] = useState(plan.focus ?? "");
  const [items, setItems] = useState(plan.items);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.minutes, 0);
  const valid = title.trim().length > 0 && items.length > 0;
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setItems(next);
    setEditing(null);
  };

  if (adding) {
    return (
      <div className="flex flex-col gap-3">
        <DrillPicker
          onAdd={(item) => {
            setItems([
              ...items,
              {
                title: item.title,
                minutes: item.minutes,
                ...(item.notes ? { notes: item.notes } : {}),
              },
            ]);
            setAdding(false);
          }}
        />
        <button onClick={() => setAdding(false)} className="h-12 text-base font-semibold underline">
          Back to the plan
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Infield day"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Focus (optional)</span>
        <select value={focus} onChange={(e) => setFocus(e.target.value)} className={field}>
          <option value="">None</option>
          {PRACTICE_FOCUSES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-1 text-base font-semibold">Drills · {total} min</p>
        <p className="mb-2 text-sm text-slate-600">Tap a drill to change how it&apos;s run.</p>
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={i} className="rounded-xl border-2 border-slate-200 bg-white p-2">
              {editing === i ? (
                <DrillEdit
                  title={it.title}
                  notes={it.notes}
                  onCancel={() => setEditing(null)}
                  onSave={(d) => {
                    setItems(items.map((x, j) => (j === i ? { minutes: x.minutes, ...d } : x)));
                    setEditing(null);
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditing(i)}
                  className="w-full rounded-lg px-1 text-left active:bg-slate-50"
                >
                  <span className="block text-base font-semibold">{it.title}</span>
                  {it.notes ? (
                    <span className="line-clamp-3 text-sm whitespace-pre-line text-slate-600">
                      {it.notes}
                    </span>
                  ) : (
                    <span className="block text-sm font-semibold text-[var(--team)]">
                      + How to run it
                    </span>
                  )}
                </button>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={it.minutes}
                  aria-label={`Minutes for ${it.title}`}
                  onChange={(e) =>
                    setItems(
                      items.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              minutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                            }
                          : x,
                      ),
                    )
                  }
                  className="h-11 w-16 rounded-lg border-2 border-slate-300 px-2 text-center text-base"
                />
                <span className="flex-1 text-base text-slate-600">min</span>
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${it.title} up`}
                  className={small}
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`Move ${it.title} down`}
                  className={small}
                >
                  ↓
                </button>
                <button
                  onClick={() => {
                    setItems(items.filter((_, j) => j !== i));
                    setEditing(null);
                  }}
                  aria-label={`Remove ${it.title}`}
                  className={`${btn} border-red-300 text-red-700`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          onClick={() => setAdding(true)}
          className="mt-2 h-12 w-full rounded-xl border-2 border-dashed border-slate-400 text-base font-bold active:bg-slate-100"
        >
          + Add a drill
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...plan, title: title.trim(), focus: focus || null, items })}
          disabled={!valid}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          {saveLabel}
        </button>
      </div>
      {onDelete && (
        <button onClick={onDelete} className="h-12 text-base font-semibold text-red-700 underline">
          Delete plan
        </button>
      )}
    </div>
  );
}
