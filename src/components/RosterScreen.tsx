"use client";

import { useState } from "react";
import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import {
  deletePlayer,
  newId,
  savePlayer,
  setCoachPitch,
  useAppData,
  useStoreState,
} from "@/lib/data/store";
import { activePlayers } from "@/lib/lineup/edit";
import { fieldPositionsFor, resolveRuleConfig } from "@/lib/rules/config";
import { FIELD_POSITIONS } from "@/lib/rules/types";
import type { Player } from "@/lib/rules/types";
import type { AppData } from "@/lib/data/types";
import { finalLineups } from "@/lib/data/game";
import { seasonSummary } from "@/lib/season/summary";
import { DataTable, stopRow, type Column } from "./shell/DataTable";
import { toast } from "./shell/Toast";
import { Shortcut } from "./shell/useShortcut";
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
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
          >
            + Add
          </button>
        ) : undefined
      }
    >
      {mode === "supabase" && (
        <Link
          href="/members"
          className="mb-3 flex min-h-14 items-center justify-between rounded-xl border-2 border-slate-300 bg-white px-4 active:bg-slate-50 lg:hidden"
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

      {mode === "supabase" && canEdit && (
        <Link
          href="/groupme"
          className="mb-3 flex min-h-14 items-center justify-between rounded-xl border-2 border-slate-300 bg-white px-4 active:bg-slate-50 lg:hidden"
        >
          <span>
            <span className="block text-lg font-semibold">GroupMe</span>
            <span className="block text-sm text-slate-600">
              {data.groupme
                ? `Connected${data.groupme.groupName ? ` · ${data.groupme.groupName}` : ""} · send a message`
                : "Post lineups and updates to the team's group"}
            </span>
          </span>
          <span aria-hidden="true" className="text-2xl text-slate-500">
            ›
          </span>
        </Link>
      )}

      <Link
        href="/money"
        className="mb-3 flex min-h-14 items-center justify-between rounded-xl border-2 border-slate-300 bg-white px-4 active:bg-slate-50 lg:hidden"
      >
        <span>
          <span className="block text-lg font-semibold">Team money</span>
          <span className="block text-sm text-slate-600">
            {permissionsFor(data.me.role, data.team.optionedAt !== null).seeAllMoney
              ? "Balances, payments and expenses"
              : "Your balance and team totals"}
          </span>
        </span>
        <span aria-hidden="true" className="text-2xl text-slate-500">
          ›
        </span>
      </Link>

      {/* Keyboards: N adds a player. */}
      <Shortcut keyName="n" run={startAdd} enabled={canEdit} />
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

      {/* Wide screens: one sortable table, pitch/catch toggled in place. */}
      <div className="hidden lg:block">
        <RosterTable
          data={data}
          players={[...active, ...inactive]}
          canEdit={canEdit}
          onEdit={(p) => setEditing(p)}
        />
      </div>

      <ul className="grid gap-2 md:grid-cols-2 lg:hidden">
        {active.map((p) => (
          <PlayerRow key={p.id} player={p} onClick={canEdit ? () => setEditing(p) : undefined} />
        ))}
      </ul>

      {inactive.length > 0 && (
        <div className="lg:hidden">
          <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Inactive
          </h2>
          <ul className="grid gap-2 opacity-60 md:grid-cols-2">
            {inactive.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                onClick={canEdit ? () => setEditing(p) : undefined}
              />
            ))}
          </ul>
        </div>
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
            onDelete={
              isNew
                ? undefined
                : async () => {
                    await deletePlayer(editing.id);
                    setEditing(null);
                  }
            }
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
        className={`flex h-full min-h-16 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left ${onClick ? "active:bg-slate-50" : ""}`}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--team)] text-lg font-bold text-white">
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

/** The roster as a table: number, name, positions, pitch and catch, family, season time. */
function RosterTable({
  data,
  players,
  canEdit,
  onEdit,
}: {
  data: AppData;
  players: Player[];
  canEdit: boolean;
  onEdit: (p: Player) => void;
}) {
  const parent = data.me.role === "parent";
  const summary = seasonSummary(
    data.players,
    finalLineups(data, data.season.id),
    resolveRuleConfig(data.season.fairPlayRules),
  );
  const season = new Map([...summary.rows, ...summary.inactiveRows].map((r) => [r.player.id, r]));
  const benchShare = (p: Player) => {
    const r = season.get(p.id);
    return r && r.field + r.bench > 0 ? r.bench / (r.field + r.bench) : -1;
  };
  const family = (p: Player) =>
    data.guardians
      .filter((g) => g.playerId === p.id)
      .map((g) => data.members.find((m) => m.userId === g.userId)?.displayName)
      .filter(Boolean)
      .join(", ");
  const toggle = (p: Player, key: "canPitch" | "canCatch", label: string) => (
    <button
      onClick={(e) => {
        stopRow(e);
        savePlayer({ ...p, [key]: !p[key] });
        toast(`${p.name} ${p[key] ? "can't" : "can"} ${label.replace("can ", "")} now`, {
          label: "Undo",
          run: () => savePlayer(p),
        });
      }}
      disabled={!canEdit}
      aria-pressed={p[key]}
      aria-label={`${p.name} ${label}`}
      className={`inline-flex h-8 min-w-12 items-center justify-center rounded-md px-2 text-sm font-bold ${
        p[key] ? "bg-amber-300 text-slate-900" : "text-slate-400"
      } ${canEdit ? "border border-slate-200 hover:border-slate-400" : ""}`}
    >
      {p[key] ? "Yes" : "—"}
    </button>
  );
  const columns: Column<Player>[] = [
    {
      key: "number",
      label: "#",
      sort: (a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999),
      render: (p) => (
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--team)] text-sm font-bold text-white">
          {p.jerseyNumber ?? "–"}
        </span>
      ),
      className: "w-16",
    },
    {
      key: "name",
      label: "Player",
      sort: (a, b) => a.name.localeCompare(b.name),
      render: (p) => (
        <span className="font-semibold">
          {p.name}
          {p.active === false && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500 uppercase">
              Inactive
            </span>
          )}
        </span>
      ),
    },
    {
      key: "positions",
      label: "Likes to play",
      render: (p) =>
        p.preferredPositions.length ? (
          p.preferredPositions.join(" · ")
        ) : (
          <span className="text-slate-400">Any</span>
        ),
    },
    {
      key: "pitch",
      label: "Pitch",
      align: "center",
      sort: (a, b) => Number(a.canPitch) - Number(b.canPitch),
      firstDir: "desc",
      render: (p) => toggle(p, "canPitch", "can pitch"),
    },
    {
      key: "catch",
      label: "Catch",
      align: "center",
      sort: (a, b) => Number(a.canCatch) - Number(b.canCatch),
      firstDir: "desc",
      render: (p) => toggle(p, "canCatch", "can catch"),
    },
    ...(data.members.length > 0
      ? [
          {
            key: "family",
            label: "Family",
            render: (p: Player) => family(p) || <span className="text-slate-400">Not linked</span>,
          },
        ]
      : []),
    ...(!parent
      ? [
          {
            key: "games",
            label: "Games",
            align: "right" as const,
            sort: (a: Player, b: Player) =>
              (season.get(a.id)?.games ?? 0) - (season.get(b.id)?.games ?? 0),
            firstDir: "desc" as const,
            render: (p: Player) => (
              <span className="tabular-nums">{season.get(p.id)?.games ?? 0}</span>
            ),
          },
          {
            key: "bench",
            label: "Sits",
            align: "right" as const,
            sort: (a: Player, b: Player) => benchShare(a) - benchShare(b),
            firstDir: "desc" as const,
            render: (p: Player) => {
              const r = season.get(p.id);
              const share = benchShare(p);
              if (share < 0) return <span className="text-slate-400">—</span>;
              return (
                <span
                  className={`tabular-nums ${r?.highBench ? "font-bold text-amber-700" : ""}`}
                  title={r?.highBench ? "Sits more than the team average" : undefined}
                >
                  {Math.round(share * 100)}%
                </span>
              );
            },
          },
        ]
      : []),
  ];
  return (
    <DataTable
      rows={players}
      columns={columns}
      rowKey={(p) => p.id}
      onRowClick={canEdit ? onEdit : undefined}
      rowLabel={(p) => `Edit ${p.name}`}
      dimRow={(p) => p.active === false}
    />
  );
}
