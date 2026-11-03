"use client";

import { useEffect, useState } from "react";
import { isCoach } from "@/lib/data/permissions";
import type { AppData } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";
import { loadBuffer } from "../pa/buffers";
import { playWalkup, stopAll } from "../pa/engine";
import { usePa } from "../pa/paData";
import { usePlaying } from "../pa/usePlaying";
import { WalkupEditor } from "../pa/WalkupEditor";
import { Sheet } from "../Sheet";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/**
 * The kid's walk-up song on My player: listen, set it up or change it. The same editor as
 * Gameday PA; a parent's change waits for a coach's OK (the database enforces it).
 */
export function KidWalkup({ data, kid }: { data: AppData; kid: Player }) {
  const pa = usePa(data.team.id);
  const playing = usePlaying();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const w = pa.walkups.find((x) => x.playerId === kid.id) ?? null;
  const readOnly = data.team.optionedAt !== null;
  const id = `preview:${kid.id}`;
  useEffect(() => stopAll, []);

  const listen = async () => {
    if (!w) return;
    setError(null);
    try {
      const [song, call] = await Promise.all([
        loadBuffer(w.songPath),
        w.announce && w.announcePath ? loadBuffer(w.announcePath) : Promise.resolve(null),
      ]);
      playWalkup(id, song, call, { mode: w.announceMode, volume: w.volume });
    } catch {
      setError("Couldn't load the walk-up. Check your signal.");
    }
  };

  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      <h2 className={heading}>Walk-up song</h2>
      <div className="flex items-center gap-2">
        <p
          className={`min-w-0 flex-1 text-base font-semibold ${
            pa.loading
              ? "text-slate-500"
              : !w
                ? "text-slate-600"
                : w.status === "approved"
                  ? "text-green-800"
                  : "text-amber-800"
          }`}
        >
          {pa.loading
            ? "Loading…"
            : !w
              ? `${kid.name.split(" ")[0]} doesn't have one yet.`
              : w.status === "approved"
                ? "✓ Ready for game day"
                : "Waiting for a coach's OK"}
        </p>
        {w && (
          <button
            onClick={() => (playing === id ? stopAll() : void listen())}
            aria-label={playing === id ? "Stop" : `Listen to ${kid.name}'s walk-up`}
            className="size-12 shrink-0 rounded-lg border-2 border-slate-300 text-lg font-bold"
          >
            {playing === id ? "■" : "▶"}
          </button>
        )}
        {!readOnly && !pa.loading && (
          <button
            onClick={() => setEditing(true)}
            className="h-12 shrink-0 rounded-lg bg-[var(--team)] px-4 text-base font-bold text-white active:bg-[var(--team-press)]"
          >
            {w ? "Edit" : "Set up"}
          </button>
        )}
      </div>
      {(error || pa.error) && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error ?? pa.error}
        </p>
      )}

      <Sheet
        open={editing}
        title={`${kid.name}'s walk-up`}
        onClose={() => {
          stopAll();
          setEditing(false);
        }}
      >
        {editing && (
          <WalkupEditor
            teamId={data.team.id}
            player={kid}
            existing={w}
            isCoach={isCoach(data.me.role) && data.team.optionedAt === null}
            signedIn={pa.signedIn}
            onSave={pa.saveWalkup}
            onRemove={pa.removeWalkup}
            onDone={() => setEditing(false)}
          />
        )}
      </Sheet>
    </section>
  );
}
