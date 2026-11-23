"use client";

import { useState } from "react";
import { DRILL_NOTES_MAX } from "@/lib/practice/aiPlan";

import { DRILL_TITLE_MAX } from "@/lib/practice/planRead";

const input =
  "w-full rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";

/** The "how to run it" box for a drill, with how much room is left near the limit. */
export function DrillHowTo({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const left = DRILL_NOTES_MAX - value.length;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-slate-700">How to run it (optional)</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, DRILL_NOTES_MAX))}
        maxLength={DRILL_NOTES_MAX}
        rows={4}
        autoFocus={autoFocus}
        placeholder="Setup, reps, coaching points…"
        className={`${input} py-2 text-base`}
      />
      {left < 200 && <span className="text-sm text-slate-600">{left} characters left</span>}
    </label>
  );
}

/** Edit a drill's name and how-to in place. */
export function DrillEdit({
  title,
  notes,
  onSave,
  onCancel,
}: {
  title: string;
  notes?: string;
  onSave: (d: { title: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(title);
  const [how, setHow] = useState(notes ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = name.trim();
        if (!t) return;
        const n = how.trim();
        onSave({ title: t, ...(n ? { notes: n } : {}) });
      }}
      className="mt-2 flex flex-col gap-2 rounded-xl bg-slate-100 p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-700">Drill</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={DRILL_TITLE_MAX}
          className={`${input} h-12`}
        />
      </label>
      <DrillHowTo value={how} onChange={setHow} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 rounded-lg border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-12 rounded-lg bg-[var(--team)] text-base font-bold text-white disabled:opacity-40"
        >
          Save drill
        </button>
      </div>
    </form>
  );
}
