"use client";

import Link from "next/link";
import { useState } from "react";
import { finalLineups } from "@/lib/data/game";
import { useAppData } from "@/lib/data/store";
import { resolveRuleConfig } from "@/lib/rules/config";
import { seasonSummary, type SeasonRow, type SeasonSummary } from "@/lib/season/summary";
import { AppShell, Loading } from "./AppShell";

type View = "summary" | "positions";
type Sort = "jersey" | "bench" | "infield";

const SORTS: { id: Sort; label: string }[] = [
  { id: "jersey", label: "Jersey #" },
  { id: "bench", label: "Most bench" },
  { id: "infield", label: "Least infield" },
];

export function SeasonScreen() {
  const data = useAppData();
  const [view, setView] = useState<View>("summary");
  const [sort, setSort] = useState<Sort>("jersey");

  if (!data) {
    return (
      <AppShell title="Season" tab="season">
        <Loading />
      </AppShell>
    );
  }

  const config = resolveRuleConfig(data.season.fairPlayRules);
  const summary = seasonSummary(data.players, finalLineups(data, data.season.id), config);
  const subtitle = `${data.season.name} · ${summary.finalGames} final game${summary.finalGames === 1 ? "" : "s"}`;

  if (summary.finalGames === 0) {
    return (
      <AppShell title="Playing time" subtitle={subtitle} tab="season">
        <div className="rounded-xl border-2 border-slate-300 bg-white p-4 text-lg leading-snug">
          <p className="font-bold">No final games yet.</p>
          <p className="mt-1">
            Open a game on the{" "}
            <Link href="/games" className="font-semibold underline">
              Games
            </Link>{" "}
            tab and tap <b>Mark final</b> after it&apos;s played. Its lineup then counts here.
          </p>
        </div>
      </AppShell>
    );
  }

  const sorted = sortRows(summary.rows, sort);
  const flagged = summary.rows.filter((r) => r.lowInfield || r.highBench).length;

  return (
    <AppShell title="Playing time" subtitle={subtitle} tab="season">
      <div
        role="tablist"
        className="mb-3 grid grid-cols-2 rounded-xl border-2 border-[#0b1f3a] p-1"
      >
        {(
          [
            ["summary", "Summary"],
            ["positions", "By position"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`h-11 rounded-lg text-base font-bold ${view === id ? "bg-[#0b1f3a] text-white" : "text-[#0b1f3a]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Sort players">
        {SORTS.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={sort === s.id}
            onClick={() => setSort(s.id)}
            className={`h-10 flex-1 rounded-full border-2 text-sm font-bold ${
              sort === s.id
                ? "border-[#0b1f3a] bg-[#0b1f3a] text-white"
                : "border-slate-300 bg-white text-slate-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {flagged > 0 && (
        <p className="mb-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base leading-snug text-amber-950">
          <b>
            {flagged} player{flagged === 1 ? " is" : "s are"} behind on playing time.
          </b>{" "}
          Auto-fill favors them in the next game.
        </p>
      )}

      {view === "summary" ? (
        <SummaryTable summary={summary} rows={sorted} />
      ) : (
        <PositionGrid summary={summary} rows={sorted} />
      )}

      <p className="mt-3 text-sm text-slate-600">
        Innings from final games only. Infield counts {config.infieldPositions.join(", ")}.
        {config.seasonBalanceThreshold !== null &&
          ` Flagged: ${config.seasonBalanceThreshold}+ innings from the team average.`}
      </p>
    </AppShell>
  );
}

function sortRows(rows: SeasonRow[], sort: Sort): SeasonRow[] {
  if (sort === "jersey") return rows;
  const key = (r: SeasonRow) => (sort === "bench" ? -r.bench : r.infield);
  return [...rows].sort((a, b) => key(a) - key(b));
}

const th = "px-1 py-2 text-xs font-bold text-slate-600 uppercase";
const nameCell = "sticky left-0 z-10 bg-white px-2 text-left";

function PlayerName({ row }: { row: SeasonRow }) {
  return (
    <th scope="row" className={`${nameCell} w-[120px] max-w-[120px] py-1.5`}>
      <span className="block w-[108px] truncate text-[15px] leading-tight font-semibold">
        {row.player.name}
      </span>
      <span className="block text-xs text-slate-600">#{row.player.jerseyNumber ?? "–"}</span>
    </th>
  );
}

function Num({ value, flag }: { value: number; flag?: string }) {
  return (
    <td className="px-1 text-center">
      <span
        title={flag}
        className={`inline-flex min-w-9 items-center justify-center rounded-md py-1 text-base font-bold ${
          flag ? "bg-red-700 text-white" : ""
        }`}
      >
        {value}
        {flag && <span className="sr-only"> ({flag})</span>}
      </span>
    </td>
  );
}

function SummaryTable({ summary, rows }: { summary: SeasonSummary; rows: SeasonRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b-2 border-slate-200">
          <tr>
            <th className={`${th} ${nameCell} text-left`}>Player</th>
            <th className={th}>Games</th>
            <th className={th}>Field</th>
            <th className={th}>Infield</th>
            <th className={th}>Bench</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player.id} className="border-b border-slate-100">
              <PlayerName row={r} />
              <Num value={r.games} />
              <Num value={r.field} />
              <Num value={r.infield} flag={r.lowInfield ? "far below team average" : undefined} />
              <Num value={r.bench} flag={r.highBench ? "far above team average" : undefined} />
            </tr>
          ))}
          {summary.inactiveRows.map((r) => (
            <tr key={r.player.id} className="border-b border-slate-100 opacity-50">
              <PlayerName row={r} />
              <Num value={r.games} />
              <Num value={r.field} />
              <Num value={r.infield} />
              <Num value={r.bench} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100">
            <th scope="row" className={`${nameCell} bg-slate-100 py-2 text-sm font-bold`}>
              Team average
            </th>
            <td />
            <td />
            <td className="text-center text-base font-bold">{summary.avgInfield.toFixed(1)}</td>
            <td className="text-center text-base font-bold">{summary.avgBench.toFixed(1)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PositionGrid({ summary, rows }: { summary: SeasonSummary; rows: SeasonRow[] }) {
  const all = [...rows, ...summary.inactiveRows];
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-slate-200 bg-white">
      <table className="border-collapse">
        <thead className="border-b-2 border-slate-200">
          <tr>
            <th className={`${th} ${nameCell} text-left`}>Player</th>
            {summary.positions.map((pos) => (
              <th key={pos} className={`${th} min-w-10 ${pos === "BENCH" ? "bg-slate-100" : ""}`}>
                {pos === "BENCH" ? "BN" : pos}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {all.map((r) => (
            <tr
              key={r.player.id}
              className={`border-b border-slate-100 ${r.player.active === false ? "opacity-50" : ""}`}
            >
              <PlayerName row={r} />
              {summary.positions.map((pos) => {
                const n = r.byPosition[pos] ?? 0;
                const flag = pos === "BENCH" && r.highBench;
                return (
                  <td
                    key={pos}
                    className={`text-center text-base ${pos === "BENCH" ? "bg-slate-100" : ""} ${
                      n ? "font-bold" : "text-slate-300"
                    }`}
                  >
                    <span
                      className={
                        flag ? "inline-block min-w-8 rounded-md bg-red-700 py-1 text-white" : ""
                      }
                    >
                      {n || "·"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
