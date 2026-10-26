"use client";

import { holdersByPosition, lineupRows, positionAt } from "@/lib/lineup/edit";
import type { FieldPosition, Lineup, Player, Severity, Violation } from "@/lib/rules/types";
import { positionClass, positionLabel } from "./positionStyle";

const RING: Record<Severity, string> = {
  block: "ring-4 ring-red-600",
  warn: "ring-4 ring-amber-400",
};

function worst(a: Severity | undefined, b: Severity): Severity {
  return a === "block" || b === "block" ? "block" : "warn";
}

/** Players (batting order) × innings. Tap a cell to set the position. */
export function LineupGrid({
  lineup,
  players,
  positions,
  violations,
  onCellTap,
}: {
  lineup: Lineup;
  players: Map<string, Player>;
  positions: FieldPosition[];
  violations: Violation[];
  /** Omit for a read-only grid (e.g. a final game). */
  onCellTap?: (playerId: string, inning: number) => void;
}) {
  const innings = Array.from({ length: lineup.innings }, (_, i) => i + 1);
  const cellIssue = new Map<string, Severity>();
  const playerIssue = new Map<string, Severity>();
  for (const v of violations) {
    if (!v.playerId) continue;
    if (v.inning) {
      const key = `${v.playerId}:${v.inning}`;
      cellIssue.set(key, worst(cellIssue.get(key), v.severity));
    } else {
      playerIssue.set(v.playerId, worst(playerIssue.get(v.playerId), v.severity));
    }
  }
  const open = innings.map((inning) => {
    const held = holdersByPosition(lineup, inning);
    return positions.filter((p) => !held.has(p)).length;
  });

  return (
    <div className="-mx-4 overflow-x-auto px-2">
      <table className="w-full border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--background)] text-left text-xs font-bold text-slate-600 uppercase">
              Batter
            </th>
            {innings.map((n) => (
              <th key={n} scope="col" className="min-w-[38px] text-center text-base font-bold">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineupRows(lineup).map(({ playerId: id, order }) => {
            const p = players.get(id);
            const issue = playerIssue.get(id);
            return (
              <tr key={id}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 w-[104px] max-w-[104px] rounded-md bg-white px-1.5 text-left ${issue ? RING[issue] : ""}`}
                >
                  <span className="block w-[92px] truncate text-[15px] leading-tight font-semibold">
                    <span className="text-slate-500">{order === null ? "–" : `${order}.`}</span>{" "}
                    {p?.name ?? "?"}
                  </span>
                  <span className="block text-xs text-slate-600">
                    #{p?.jerseyNumber ?? "–"}
                    {order === null && " · not batting"}
                  </span>
                </th>
                {innings.map((inning) => {
                  const pos = positionAt(lineup, inning, id);
                  const sev = cellIssue.get(`${id}:${inning}`);
                  return (
                    <td key={inning} className="p-0">
                      <button
                        onClick={onCellTap ? () => onCellTap(id, inning) : undefined}
                        disabled={!onCellTap}
                        aria-label={`${p?.name ?? id}, inning ${inning}: ${pos ?? "not set"}`}
                        className={`flex h-11 w-full min-w-[38px] items-center justify-center rounded-md text-[15px] font-bold ${positionClass(pos)} ${sev ? RING[sev] : ""}`}
                      >
                        {positionLabel(pos)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--background)] text-left text-xs font-bold text-slate-600 uppercase">
              Open spots
            </th>
            {open.map((n, i) => (
              <td
                key={i}
                className={`text-center text-sm font-bold ${n ? "text-red-700" : "text-green-800"}`}
              >
                {n ? n : "✓"}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
