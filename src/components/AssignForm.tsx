"use client";

import { useState } from "react";
import type { PlayAssignment } from "@/lib/data/types";
import { PlayPicker } from "./PlayPicker";

/** Title, due date and plays for a homework assignment. */
export function AssignForm({
  assignment,
  onSave,
  onCancel,
}: {
  assignment: PlayAssignment;
  onSave: (a: PlayAssignment) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [dueDate, setDueDate] = useState(assignment.dueDate ?? "");
  const [playIds, setPlayIds] = useState(assignment.playIds);
  const valid = title.trim().length > 0 && playIds.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onSave({ ...assignment, title: title.trim(), dueDate: dueDate || null, playIds });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Bunt defense"
          className="h-12 rounded-xl border-2 border-slate-300 px-3 text-lg focus:border-[var(--team)] focus:outline-none"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-base font-semibold">Due (optional)</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-12 min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
        />
      </label>
      <div>
        <p className="mb-2 text-base font-semibold">
          Plays <span className="text-slate-600">({playIds.length} picked)</span>
        </p>
        <PlayPicker selected={playIds} onChange={setPlayIds} />
      </div>
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 bg-white px-4 pt-2 pb-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid}
          className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
        >
          {playIds.length ? `Assign ${playIds.length}` : "Assign"}
        </button>
      </div>
    </form>
  );
}
