"use client";

import { useState } from "react";
import { newId, savePlayer, setCoachPitch, useAppData } from "@/lib/data/store";
import { activePlayers } from "@/lib/lineup/edit";
import { fieldPositionsFor } from "@/lib/rules/config";
import { FIELD_POSITIONS } from "@/lib/rules/types";
import type { Player } from "@/lib/rules/types";
import { AppShell, Loading } from "./AppShell";
import { PlayerForm, Toggle } from "./PlayerForm";
import { Sheet } from "./Sheet";

export function RosterScreen() {
  const data = useAppData();
  const [editing, setEditing] = useState<Player | null>(null);

  if (!data) {
    return (
      <AppShell title="Roster" tab="roster">
        <Loading />
      </AppShell>
    );
  }

  // Coach's pitch games can use either outfield, so offer LCF/RCF as preferences too.
  const positions = data.team.coachPitch
    ? FIELD_POSITIONS.filter(
        (p) => fieldPositionsFor(9).includes(p) || fieldPositionsFor(10).includes(p),
      )
    : fieldPositionsFor(9);
  const active = activePlayers(data.players);
  const inactive = data.players.filter((p) => p.active === false);
  const isNew = editing !== null && !data.players.some((p) => p.id === editing.id);
  const startAdd = () =>
    setEditing({
      id: newId(),
      name: "",
      preferredPositions: [],
      canPitch: false,
      canCatch: false,
      active: true,
    });

  return (
    <AppShell
      title="Roster"
      subtitle={`${data.team.name} · ${active.length} active`}
      tab="roster"
      action={
        <button
          onClick={startAdd}
          className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
        >
          + Add
        </button>
      }
    >
      <div className="mb-4">
        <Toggle
          label="Coach's pitch"
          hint={
            data.team.coachPitch
              ? "P is a fielding spot. New games default to 10 fielders."
              : "Kids pitch. New games default to 9 fielders."
          }
          checked={data.team.coachPitch}
          onChange={setCoachPitch}
        />
      </div>

      <ul className="flex flex-col gap-2">
        {active.map((p) => (
          <PlayerRow key={p.id} player={p} onClick={() => setEditing(p)} />
        ))}
      </ul>

      {inactive.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Inactive
          </h2>
          <ul className="flex flex-col gap-2 opacity-60">
            {inactive.map((p) => (
              <PlayerRow key={p.id} player={p} onClick={() => setEditing(p)} />
            ))}
          </ul>
        </>
      )}

      <button
        onClick={startAdd}
        className="mt-4 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
      >
        + Add player
      </button>

      <Sheet
        open={editing !== null}
        title={isNew ? "Add player" : "Edit player"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <PlayerForm
            key={editing.id}
            player={editing}
            positions={positions}
            onCancel={() => setEditing(null)}
            onSave={(p) => {
              savePlayer(p);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function PlayerRow({ player, onClick }: { player: Player; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left active:bg-slate-50"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0b1f3a] text-lg font-bold text-white">
          {player.jerseyNumber ?? "–"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold">{player.name}</span>
          <span className="block truncate text-sm text-slate-600">
            {player.preferredPositions.length
              ? player.preferredPositions.join(" · ")
              : "Any position"}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          {player.canPitch && <Badge>P</Badge>}
          {player.canCatch && <Badge>C</Badge>}
        </span>
      </button>
    </li>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-md bg-amber-300 text-sm font-bold text-slate-900">
      {children}
    </span>
  );
}
