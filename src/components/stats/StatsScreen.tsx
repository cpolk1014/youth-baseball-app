"use client";

import { useMemo, useState } from "react";
import { isCoach } from "@/lib/data/permissions";
import { useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import {
  emptyIn,
  KEY_COLUMNS,
  lowerIsBetter,
  statGroups,
  statNumber,
  type StatPlayer,
  type TeamStats,
} from "@/lib/stats/gamechanger";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { ImportStats } from "./ImportStats";
import { useTeamStats } from "./statsData";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

export function StatsScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Stats" tab="stats">
        <Loading />
      </AppShell>
    );
  }
  const staff = isCoach(data.me.role) || data.me.role === "manager";
  if (!staff) {
    return (
      <AppShell title="Stats" subtitle={data.team.name} tab="stats">
        <p className="text-lg">Stats are for coaches and managers.</p>
      </AppShell>
    );
  }
  return <Stats data={data} />;
}

function Stats({ data }: { data: AppData }) {
  const { stats, loading, error, save } = useTeamStats(data.season.id);
  const [importing, setImporting] = useState(false);
  const canImport = data.team.optionedAt === null;

  const importButton = canImport && (
    <button
      onClick={() => setImporting(true)}
      className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
    >
      Import
    </button>
  );

  return (
    <AppShell
      title="Stats"
      subtitle={`${data.team.name} · ${data.season.name}`}
      tab="stats"
      action={importButton}
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          Couldn&apos;t load stats ({error}).
        </p>
      ) : stats ? (
        <>
          <p className="mb-3 text-base text-slate-700">
            From GameChanger · imported {formatWhen(stats.importedAt)}
          </p>
          <StatTables stats={stats.data} data={data} />
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
          <p className="text-lg font-bold">No stats yet</p>
          <p className="text-base text-slate-700">
            Export your team&apos;s season stats from GameChanger as a CSV (on the web, open the
            team&apos;s Stats and choose Export), then import the file here. Each import replaces
            the last one, so do it once a week to keep stats current.
          </p>
          {canImport && (
            <button
              onClick={() => setImporting(true)}
              className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white"
            >
              Import from GameChanger
            </button>
          )}
        </div>
      )}

      <Sheet open={importing} title="Import from GameChanger" onClose={() => setImporting(false)}>
        {importing && (
          <ImportStats
            data={data}
            replacing={stats ? formatWhen(stats.importedAt) : null}
            onCancel={() => setImporting(false)}
            onImport={async (fileName, next) => {
              await save(fileName, next);
              setImporting(false);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Shown {
  player: StatPlayer;
  name: string;
  number: string;
  onRoster: boolean;
}

/** Roster name and number when matched; GameChanger's otherwise. */
function shownPlayers(stats: TeamStats, data: AppData): Shown[] {
  return stats.players.map((p) => {
    const kid = data.players.find((x) => x.id === p.playerId);
    return kid
      ? {
          player: p,
          name: kid.name,
          number: kid.jerseyNumber == null ? p.number : String(kid.jerseyNumber),
          onRoster: true,
        }
      : { player: p, name: `${p.first} ${p.last}`.trim(), number: p.number, onRoster: false };
  });
}

function StatTables({ stats, data }: { stats: TeamStats; data: AppData }) {
  const groups = statGroups(stats);
  const [group, setGroup] = useState(groups[0] ?? "");
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Shown | null>(null);

  const people = useMemo(() => shownPlayers(stats, data), [stats, data]);
  const inGroup = stats.columns.flatMap((c, i) => (c.group === group ? [i] : []));
  const keys = KEY_COLUMNS[group];
  const firstOf = (key: string) => inGroup.find((i) => stats.columns[i]!.key === key);
  const keyCols = (keys ?? []).map(firstOf).filter((i): i is number => i !== undefined);
  const cols = all || keyCols.length === 0 ? inGroup : keyCols;

  const withData = people.filter((p) => !emptyIn(p.player.values, inGroup));
  const hidden = people.length - withData.length;
  const rows = sort
    ? [...withData].sort((a, b) => {
        const x = statNumber(a.player.values[sort.col] ?? "");
        const y = statNumber(b.player.values[sort.col] ?? "");
        if (x === null) return y === null ? 0 : 1;
        if (y === null) return -1;
        return (x - y) * sort.dir;
      })
    : withData;

  const pickGroup = (g: string) => {
    setGroup(g);
    setSort(null);
  };
  const sortBy = (col: number) => {
    const best: 1 | -1 = lowerIsBetter(stats.columns[col]!) ? 1 : -1;
    setSort((s) => (s?.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: best }));
  };

  return (
    <>
      <div role="tablist" className="mb-3 flex gap-2">
        {groups.map((g) => (
          <button
            key={g}
            role="tab"
            aria-selected={g === group}
            onClick={() => pickGroup(g)}
            className={`h-12 flex-1 rounded-xl text-base font-bold ${
              g === group
                ? "bg-[var(--team)] text-white"
                : "border-2 border-slate-300 bg-white text-slate-800 active:bg-slate-100"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Tap a column to sort, a player for everything.</p>
        {keyCols.length > 0 && (
          <button
            onClick={() => setAll(!all)}
            className="h-10 shrink-0 rounded-lg border-2 border-slate-300 bg-white px-3 text-sm font-bold active:bg-slate-100"
          >
            {all ? "Key columns" : `All ${inGroup.length} columns`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border-2 border-slate-200 bg-white">
        <table className="w-full border-collapse text-base tabular-nums">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-sm font-bold">
                Player
              </th>
              {cols.map((i) => {
                const c = stats.columns[i]!;
                const active = sort?.col === i;
                return (
                  <th
                    key={i}
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                    className="p-0 text-right"
                  >
                    <button
                      onClick={() => sortBy(i)}
                      title={c.description ?? c.key}
                      className={`h-11 w-full px-2.5 text-right text-sm font-bold whitespace-nowrap ${
                        active ? "text-[var(--team)] underline" : "text-slate-700"
                      }`}
                    >
                      {c.key}
                      {active && (sort.dir === 1 ? " ▲" : " ▼")}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, r) => (
              <tr key={r} className="border-b border-slate-100">
                <th scope="row" className="sticky left-0 z-10 bg-white p-0 text-left font-normal">
                  <button
                    onClick={() => setOpen(p)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left whitespace-nowrap active:bg-slate-100"
                  >
                    <span className="w-6 shrink-0 text-sm text-slate-500">{p.number}</span>
                    <span className="max-w-32 truncate font-semibold underline decoration-slate-300 md:max-w-none">
                      {p.name}
                    </span>
                  </button>
                </th>
                {cols.map((i) => (
                  <td key={i} className="px-2.5 py-2 text-right whitespace-nowrap">
                    {p.player.values[i]}
                  </td>
                ))}
              </tr>
            ))}
            {stats.totals && (
              <tr className="bg-slate-50 font-bold">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">
                  Team
                </th>
                {cols.map((i) => (
                  <td key={i} className="px-2.5 py-2 text-right whitespace-nowrap">
                    {stats.totals![i]}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {hidden} {hidden === 1 ? "player has" : "players have"} no {group.toLowerCase()} stats.
        </p>
      )}

      <details className="mt-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold">
          What the columns mean
        </summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
          {cols.map((i) => (
            <div key={i} className="contents">
              <dt className="font-bold">{stats.columns[i]!.key}</dt>
              <dd className="text-slate-700">{stats.columns[i]!.description ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </details>

      <Sheet open={open !== null} title={open?.name ?? ""} onClose={() => setOpen(null)}>
        {open && <PlayerStats shown={open} stats={stats} />}
      </Sheet>
    </>
  );
}

/** Everything for one player, by group: key stats first, the rest behind a toggle. */
function PlayerStats({ shown, stats }: { shown: Shown; stats: TeamStats }) {
  return (
    <div className="flex flex-col gap-5">
      {!shown.onRoster && (
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
          Not matched to anyone on the roster. Re-import to match them.
        </p>
      )}
      {statGroups(stats).map((g) => {
        const idx = stats.columns.flatMap((c, i) => (c.group === g ? [i] : []));
        if (emptyIn(shown.player.values, idx)) return null;
        const keySet = new Set(KEY_COLUMNS[g] ?? []);
        const seen = new Set<string>();
        const key = idx.filter((i) => {
          const k = stats.columns[i]!.key;
          if (!keySet.has(k) || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const rest = idx.filter((i) => !key.includes(i));
        const list = (items: number[]) => (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-base">
            {items.map((i) => (
              <div key={i} className="contents">
                <dt className="border-b border-slate-100 py-1.5">
                  <strong>{stats.columns[i]!.key}</strong>{" "}
                  <span className="text-slate-600">{stats.columns[i]!.description}</span>
                </dt>
                <dd className="border-b border-slate-100 py-1.5 text-right font-semibold tabular-nums">
                  {shown.player.values[i]}
                </dd>
              </div>
            ))}
          </dl>
        );
        return (
          <section key={g}>
            <h3 className={heading}>{g}</h3>
            {list(key.length > 0 ? key : idx)}
            {key.length > 0 && rest.length > 0 && (
              <details className="mt-1">
                <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold">
                  All {g.toLowerCase()} stats
                </summary>
                {list(rest)}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
