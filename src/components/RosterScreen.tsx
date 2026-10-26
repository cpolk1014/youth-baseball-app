"use client";

import { useState } from "react";
import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import { newId, savePlayer, setCoachPitch, useAppData, useStoreState } from "@/lib/data/store";
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
  const { mode } = useStoreState();

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
  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const others = data.members.length;
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
        canEdit ? (
          <button
            onClick={startAdd}
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
          >
            + Add
          </button>
        ) : undefined
      }
    >
      {mode === "supabase" && (
        <Link
          href="/members"
          className="mb-3 flex min-h-14 items-center justify-between rounded-xl border-2 border-slate-300 bg-white px-4 active:bg-slate-50"
        >
          <span>
            <span className="block text-lg font-semibold">Coaches &amp; parents</span>
            <span className="block text-sm text-slate-600">
              {others} on the team
              {permissionsFor(data.me.role, data.team.optionedAt !== null).manageMembers
                ? " · invite people"
                : ""}
            </span>
          </span>
          <span aria-hidden="true" className="text-2xl text-slate-500">
            ›
          </span>
        </Link>
      )}

      <div className={`mb-4 ${canEdit ? "" : "pointer-events-none"}`} aria-disabled={!canEdit}>
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
          <PlayerRow key={p.id} player={p} onClick={canEdit ? () => setEditing(p) : undefined} />
        ))}
      </ul>

      {inactive.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Inactive
          </h2>
          <ul className="flex flex-col gap-2 opacity-60">
            {inactive.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                onClick={canEdit ? () => setEditing(p) : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {canEdit && (
        <button
          onClick={startAdd}
          className="mt-4 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add player
        </button>
      )}

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

/** A player card; tappable to edit when `onClick` is given, otherwise view-only. */
function PlayerRow({ player, onClick }: { player: Player; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <li>
      <Tag
        onClick={onClick}
        className={`flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left ${onClick ? "active:bg-slate-50" : ""}`}
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
      </Tag>
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
