"use client";

import { PLAYS, playsIn } from "@/lib/plays/library";
import { PLAY_CATEGORIES } from "@/lib/plays/types";

/** Checklist of library plays by category. */
export function PlayPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : // Keep library order so lists read the same everywhere.
          PLAYS.map((p) => p.id).filter((x) => x === id || selected.includes(x)),
    );
  return (
    <div className="flex flex-col gap-4">
      {PLAY_CATEGORIES.map((c) => (
        <fieldset key={c}>
          <legend className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
            {c}
          </legend>
          <ul className="flex flex-col gap-1">
            {playsIn(c).map((p) => (
              <li key={p.id}>
                <label className="flex min-h-12 items-center gap-3 rounded-lg px-1 active:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-6 shrink-0 accent-[#0b1f3a]"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-semibold">{p.name}</span>
                    <span className="block text-sm text-slate-600">{p.situation}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
