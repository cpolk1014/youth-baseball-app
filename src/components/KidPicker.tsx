"use client";

import { useEffect, useState } from "react";
import { myUserId, setKidsFor, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { activePlayers } from "@/lib/lineup/edit";
import type { Player } from "@/lib/rules/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Checklist of the team's active players. `taken` marks kids another family is linked to. */
export function KidPicker({
  players,
  selected,
  onChange,
  taken = {},
}: {
  players: Player[];
  selected: string[];
  onChange: (ids: string[]) => void;
  taken?: Record<string, string>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {players.map((p) => (
        <li key={p.id}>
          <label
            className={`flex min-h-12 items-center gap-3 rounded-lg px-1 ${taken[p.id] ? "text-slate-400" : "active:bg-slate-100"}`}
          >
            <input
              type="checkbox"
              disabled={!!taken[p.id] && !selected.includes(p.id)}
              checked={selected.includes(p.id)}
              onChange={() =>
                onChange(
                  selected.includes(p.id)
                    ? selected.filter((x) => x !== p.id)
                    : [...selected, p.id],
                )
              }
              className="size-6 shrink-0 accent-[var(--team)]"
            />
            <span className="text-lg font-semibold">
              {p.jerseyNumber != null && (
                <span className="mr-1 text-slate-500">#{p.jerseyNumber}</span>
              )}
              {p.name}
              {taken[p.id] && !selected.includes(p.id) && (
                <span className="block text-sm font-normal">{taken[p.id]}</span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Pick kids for a member and save; `onDone` runs after a successful save. */
export function KidsForm({
  userId,
  onDone,
  cancelLabel = "Cancel",
}: {
  userId: string;
  onDone: () => void;
  cancelLabel?: string;
}) {
  const data = useAppData()!;
  const [selected, setSelected] = useState(() => kidsOf(data, userId).map((p) => p.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Picking your own kids: one already linked to another family needs a coach to add you
  // (so nobody can claim someone else's kid). Coaches linking others aren't limited.
  const self = userId === myUserId(data);
  const [taken, setTaken] = useState<Record<string, string>>({});
  const teamId = data.team.id;
  useEffect(() => {
    if (!self || !isSupabaseConfigured) return;
    let current = true;
    void import("@/lib/data/account-backend")
      .then((m) => m.teamFamilies(teamId))
      .then((families) => {
        if (!current) return;
        const out: Record<string, string> = {};
        for (const [playerId, people] of families) {
          if (people.some((f) => f.userId === userId)) continue;
          const names = people.map((f) => f.name?.trim()).filter(Boolean);
          out[playerId] = names.length
            ? `Linked to ${names.join(" & ")}`
            : "Linked to another family";
        }
        setTaken(out);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [self, teamId, userId]);
  const anyTaken = Object.keys(taken).length > 0;
  return (
    <div className="flex flex-col gap-3">
      <KidPicker
        players={activePlayers(data.players)}
        selected={selected}
        onChange={setSelected}
        taken={taken}
      />
      {anyTaken && (
        <p className="text-sm text-slate-600">
          Is a linked player yours too (say, the other parent)? Ask a coach or manager to add you on
          Coaches &amp; parents.
        </p>
      )}
      {error && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-14 rounded-xl border-2 border-slate-400 bg-white text-lg font-bold active:bg-slate-100"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await setKidsFor(userId, selected);
              onDone();
            } catch (e) {
              setError(
                /row-level security|policy|42501/i.test(e instanceof Error ? e.message : String(e))
                  ? "Another family is already linked to that player. Ask a coach or manager to add you."
                  : "Couldn't save. Check your connection and try again.",
              );
            } finally {
              setSaving(false);
            }
          }}
          className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** The players a member is linked to, in roster order. */
export function kidsOf(data: AppData, userId: string): Player[] {
  const ids = new Set(data.guardians.filter((g) => g.userId === userId).map((g) => g.playerId));
  return data.players.filter((p) => ids.has(p.id));
}

const skippedKey = (teamId: string) => `lineup-app:kids-skipped:${teamId}`;

function wasSkipped(teamId: string): boolean {
  try {
    return window.localStorage.getItem(skippedKey(teamId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Asks a parent once which player(s) are theirs. "Not now" hides it on this device; they
 * (or a coach) can set it later on Coaches & parents.
 */
export function KidsPrompt() {
  const data = useAppData();
  const [skipped, setSkipped] = useState<string | null>(null);
  if (!data || data.me.role !== "parent") return null;
  if (activePlayers(data.players).length === 0) return null;
  if (kidsOf(data, myUserId(data)).length > 0) return null;
  if (skipped === data.team.id || wasSkipped(data.team.id)) return null;

  const skip = () => {
    try {
      window.localStorage.setItem(skippedKey(data.team.id), "1");
    } catch {
      // Private mode: it just asks again next time.
    }
    setSkipped(data.team.id);
  };
  return (
    <section className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
      <h2 className="text-xl font-bold">Which player is yours?</h2>
      <p className="mb-2 text-base text-slate-700">
        Pick your kid (or kids) on {data.team.name}, so homework and team info reach the right
        family.
      </p>
      <KidsForm userId={myUserId(data)} onDone={skip} cancelLabel="Not now" />
    </section>
  );
}
