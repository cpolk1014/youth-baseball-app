"use client";

import { activePlayers } from "@/lib/lineup/edit";
import type { Player } from "@/lib/rules/types";

/** Who's here for this game. Absent players get no position and no batting spot. */
export function Attendance({
  players,
  absent,
  onSetAbsent,
  readOnly = false,
}: {
  players: Player[];
  absent: string[];
  onSetAbsent: (playerId: string, isAbsent: boolean) => void;
  readOnly?: boolean;
}) {
  const roster = activePlayers(players);
  const away = new Set(absent);
  const here = roster.length - roster.filter((p) => away.has(p.id)).length;

  return (
    <div>
      <p className="mb-3 text-base text-slate-700">
        <b>
          {here} of {roster.length} here.
        </b>{" "}
        {readOnly
          ? ""
          : "Absent players are left out of the field and batting order for this game only."}
      </p>
      <ul className="flex flex-col gap-2">
        {roster.map((p) => {
          const isAway = away.has(p.id);
          return (
            <li key={p.id}>
              <button
                role="switch"
                aria-checked={!isAway}
                aria-label={`${p.name} ${isAway ? "absent" : "here"}`}
                disabled={readOnly}
                onClick={() => onSetAbsent(p.id, !isAway)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 text-left ${
                  isAway
                    ? "border-dashed border-slate-300 bg-slate-50"
                    : "border-slate-200 bg-white"
                } ${readOnly ? "" : "active:bg-slate-100"}`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                    isAway ? "bg-slate-300 text-slate-600" : "bg-[#0b1f3a] text-white"
                  }`}
                >
                  {p.jerseyNumber ?? "–"}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-lg font-semibold ${isAway ? "text-slate-500 line-through" : ""}`}
                >
                  {p.name}
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                    isAway ? "bg-red-700 text-white" : "bg-green-700 text-white"
                  }`}
                >
                  {isAway ? "Absent" : "Here"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
