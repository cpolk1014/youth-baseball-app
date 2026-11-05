"use client";

import { useState } from "react";
import { namesAgree } from "@/lib/boxscore/names";
import type { Player } from "@/lib/rules/types";
import type { KidTeam } from "./kidGames";

const dismissKey = (playerId: string) => `rallycap:not-same-kid:${playerId}`;
function dismissed(playerId: string): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(dismissKey(playerId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const teamText = (t: KidTeam) =>
  [t.teamName ?? "a team that's since been removed", t.seasonName ? `(${t.seasonName})` : null]
    .filter(Boolean)
    .join(" ");

/**
 * A kid's record follows them from team to team. On a new team the parent says once that
 * it's the same kid as on last year's team; after that every team's box scores add up.
 */
export function KidTeams({
  kid,
  teamId,
  kidTeams,
  link,
  split,
}: {
  kid: Player;
  teamId: string;
  kidTeams: KidTeam[];
  link: (playerId: string, athleteId: string) => Promise<void>;
  split: (playerId: string) => Promise<void>;
}) {
  const [hidden, setHidden] = useState<string[]>(() => dismissed(kid.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const athlete = kidTeams.find((r) => r.playerId === kid.id)?.athleteId ?? null;
  if (!athlete) return null;

  const others = kidTeams.filter((r) => r.athleteId === athlete && r.playerId !== kid.id);
  // The parent's other kids' records with the same name, not already on this team.
  const byAthlete = new Map<string, KidTeam[]>();
  for (const r of kidTeams) {
    if (r.athleteId === athlete) continue;
    byAthlete.set(r.athleteId, [...(byAthlete.get(r.athleteId) ?? []), r]);
  }
  const candidates = [...byAthlete.entries()].filter(
    ([id, rows]) =>
      !hidden.includes(id) &&
      !rows.some((r) => r.teamId === teamId) &&
      namesAgree(kid.name, rows[0]!.name),
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const first = kid.name.split(" ")[0];
  if (candidates.length === 0 && others.length === 0) return null;

  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      {candidates.map(([id, rows]) => (
        <div key={id} className="mb-3 last:mb-0">
          <p className="text-base">
            Is this the same {rows[0]!.name} who played for {rows.map(teamText).join(" and ")}?
            Saying yes brings {first}&apos;s stats from there to here, and they keep adding up.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void run(() => link(kid.id, id))}
              disabled={busy}
              className="h-12 flex-[2] rounded-xl bg-[var(--team)] text-base font-bold text-white disabled:opacity-40"
            >
              Yes, same player
            </button>
            <button
              onClick={() => {
                const next = [...hidden, id];
                setHidden(next);
                try {
                  window.localStorage.setItem(dismissKey(kid.id), JSON.stringify(next));
                } catch {
                  // Just this time, then.
                }
              }}
              className="h-12 flex-1 rounded-xl border-2 border-slate-400 text-base font-bold"
            >
              No
            </button>
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <div className={candidates.length ? "mt-3 border-t-2 border-slate-100 pt-3" : ""}>
          <p className="text-base">
            <b>{first}&apos;s stats include every team:</b> {others.map(teamText).join(", ")} and
            this one.
          </p>
          <button
            onClick={() => void run(() => split(kid.id))}
            disabled={busy}
            className="mt-1 text-sm text-slate-600 underline disabled:opacity-40"
          >
            Not the same player? Keep this team separate
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
