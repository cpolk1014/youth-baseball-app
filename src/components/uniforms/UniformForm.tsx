"use client";

import { useState } from "react";
import {
  cleanName,
  cleanPieces,
  MAX_PIECE,
  MAX_UNIFORM_NAME,
  UNIFORM_COLORS,
  UNIFORM_PIECES,
  uniformProblem,
  type UniformPieces,
} from "@/lib/uniforms";
import { Dot } from "./UniformSwatches";

/**
 * A combo's name (left out for a game's own uniform) and its five pieces: tap a color, or
 * type something like "White, red sleeves".
 */
export function UniformForm({
  name: startName,
  pieces: startPieces,
  saveLabel,
  onSave,
  onCancel,
  onDelete,
}: {
  /** null: no name (a uniform just for one game). */
  name: string | null;
  pieces: UniformPieces;
  saveLabel: string;
  onSave: (name: string, pieces: UniformPieces) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(startName ?? "");
  const [pieces, setPieces] = useState(startPieces);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const problem = uniformProblem(startName === null ? null : name, cleanPieces(pieces));

  const set = (key: keyof UniformPieces, value: string) => setPieces({ ...pieces, [key]: value });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!problem) onSave(cleanName(name), cleanPieces(pieces));
      }}
    >
      {startName !== null && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_UNIFORM_NAME}
            placeholder="Dark combo"
            className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
        </label>
      )}
      {UNIFORM_PIECES.map(({ key, label }) => (
        <fieldset key={key} className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">{label}</legend>
          <input
            value={pieces[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            maxLength={MAX_PIECE}
            placeholder="Tap a color or type one"
            aria-label={label}
            className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {UNIFORM_COLORS.map((c) => {
              const on = (pieces[key] ?? "").toLowerCase() === c.name.toLowerCase();
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => set(key, on ? "" : c.name)}
                  aria-label={`${label}: ${c.name}`}
                  aria-pressed={on}
                  title={c.name}
                  className={`flex size-11 items-center justify-center rounded-full ${
                    on ? "ring-4 ring-[var(--team)] ring-offset-2" : ""
                  }`}
                >
                  <Dot color={c.hex} size={34} />
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {tried && problem && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {problem}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold text-slate-800 active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white"
        >
          {saveLabel}
        </button>
      </div>
      {onDelete &&
        (deleting ? (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3">
            <p className="text-base">
              Delete this combo? Games set to wear it will show no uniform.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleting(false)}
                className="h-12 flex-1 rounded-xl border-2 border-slate-400 bg-white text-base font-bold"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="h-12 flex-1 rounded-xl bg-red-700 text-base font-bold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="h-12 text-base font-semibold text-red-700 underline"
          >
            Delete combo
          </button>
        ))}
    </form>
  );
}
