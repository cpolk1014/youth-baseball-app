"use client";

import { useState } from "react";
import type { FieldPosition, Player } from "@/lib/rules/types";

export function PlayerForm({
  player,
  positions,
  onSave,
  onCancel,
  onDelete,
}: {
  player: Player;
  positions: FieldPosition[];
  onSave: (player: Player) => void;
  onCancel: () => void;
  /** Existing players: delete them (rejects with the reason when something is attached). */
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(player.name);
  const [jersey, setJersey] = useState(player.jerseyNumber?.toString() ?? "");
  const [preferred, setPreferred] = useState<FieldPosition[]>(player.preferredPositions);
  const [canPitch, setCanPitch] = useState(player.canPitch);
  const [canCatch, setCanCatch] = useState(player.canCatch);
  const [active, setActive] = useState(player.active !== false);
  const [deleting, setDeleting] = useState<"ask" | "busy" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting("busy");
    setDeleteError(null);
    try {
      await onDelete!();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      setDeleting(null);
    }
  };

  const jerseyNumber = jersey === "" ? null : Number(jersey);
  const jerseyError =
    jerseyNumber !== null &&
    !(Number.isInteger(jerseyNumber) && jerseyNumber >= 0 && jerseyNumber <= 99)
      ? "Use a number from 0 to 99."
      : null;
  const valid = name.trim().length > 0 && !jerseyError;

  const togglePreferred = (pos: FieldPosition) =>
    setPreferred((cur) => (cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos]));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
          ...player,
          name: name.trim(),
          jerseyNumber,
          preferredPositions: positions.filter((p) => preferred.includes(p)),
          canPitch,
          canCatch,
          active,
        });
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder="First name + last initial"
            className="h-12 rounded-lg border-2 border-slate-400 px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
        </label>
        <label className="flex w-20 flex-col gap-1">
          <span className="text-sm font-semibold text-slate-700">Jersey #</span>
          <input
            value={jersey}
            onChange={(e) => setJersey(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputMode="numeric"
            className="h-12 rounded-lg border-2 border-slate-400 px-3 text-center text-lg focus:border-[var(--team)] focus:outline-none"
          />
        </label>
      </div>
      {jerseyError && <p className="-mt-3 text-sm font-semibold text-red-700">{jerseyError}</p>}

      <div className="flex flex-col gap-2">
        <Toggle label="Can pitch" checked={canPitch} onChange={setCanPitch} />
        <Toggle label="Can catch" checked={canCatch} onChange={setCanCatch} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          Preferred positions <span className="font-normal">(optional)</span>
        </legend>
        <div className="grid grid-cols-5 gap-2">
          {positions.map((pos) => {
            const on = preferred.includes(pos);
            return (
              <button
                key={pos}
                type="button"
                aria-pressed={on}
                onClick={() => togglePreferred(pos)}
                className={`h-12 rounded-lg border-2 text-base font-bold ${
                  on
                    ? "border-[var(--team)] bg-[var(--team)] text-white"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                {pos}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Toggle
        label="Active"
        hint="Inactive players are left out of lineups."
        checked={active}
        onChange={setActive}
      />

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
          disabled={!valid}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {onDelete &&
        (deleting === null ? (
          <button
            type="button"
            onClick={() => setDeleting("ask")}
            className="h-12 text-base font-semibold text-red-700 underline"
          >
            Delete player
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3">
            <p className="text-base">
              Delete {player.name}? Only for a player added by mistake: it works when they
              aren&apos;t in any lineup, team money or walk-up.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="h-12 flex-1 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={deleting === "busy"}
                className="h-12 flex-1 rounded-xl bg-red-700 text-base font-bold text-white disabled:opacity-60"
              >
                {deleting === "busy" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      {deleteError && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {deleteError}
        </p>
      )}
    </form>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 border-slate-300 bg-white px-4 text-left active:bg-slate-50"
    >
      <span>
        <span className="block text-lg font-semibold">{label}</span>
        {hint && <span className="block text-sm text-slate-600">{hint}</span>}
      </span>
      <span
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-green-700" : "bg-slate-400"}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-7" : "translate-x-1"}`}
        />
      </span>
    </button>
  );
}
