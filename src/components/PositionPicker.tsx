"use client";

import { holdersByPosition, positionAt } from "@/lib/lineup/edit";
import type { FieldPosition, Lineup, Player, Position } from "@/lib/rules/types";

/** Grid of positions for one player in one inning; shows who holds each spot. */
export function PositionPicker({
  lineup,
  inning,
  player,
  players,
  positions,
  onPick,
}: {
  lineup: Lineup;
  inning: number;
  player: Player;
  players: Map<string, Player>;
  positions: FieldPosition[];
  onPick: (position: Position | null) => void;
}) {
  const current = positionAt(lineup, inning, player.id);
  const holders = holdersByPosition(lineup, inning);

  const note = (pos: FieldPosition): { text: string; bad?: boolean } => {
    if (pos === "P" && !player.canPitch) return { text: "can't pitch", bad: true };
    if (pos === "C" && !player.canCatch) return { text: "can't catch", bad: true };
    const holder = holders.get(pos);
    if (holder && holder !== player.id)
      return { text: `swap ${players.get(holder)?.name.split(" ")[0] ?? ""}` };
    if (holder === player.id) return { text: "current" };
    return { text: "open" };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {positions.map((pos) => {
          const n = note(pos);
          const selected = current === pos;
          return (
            <button
              key={pos}
              onClick={() => onPick(pos)}
              aria-pressed={selected}
              className={`flex h-16 flex-col items-center justify-center rounded-xl border-2 ${
                selected
                  ? "border-[#0b1f3a] bg-[#0b1f3a] text-white"
                  : "border-slate-300 bg-white active:bg-slate-100"
              }`}
            >
              <span className="text-xl font-bold">{pos}</span>
              <span
                className={`text-xs font-semibold ${selected ? "text-white/80" : n.bad ? "text-red-700" : n.text === "open" ? "text-green-800" : "text-slate-600"}`}
              >
                {n.text}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onPick("BENCH")}
          aria-pressed={current === "BENCH"}
          className={`col-span-2 h-14 rounded-xl border-2 text-lg font-bold ${
            current === "BENCH"
              ? "border-slate-700 bg-slate-700 text-white"
              : "border-slate-300 bg-slate-200 active:bg-slate-300"
          }`}
        >
          Bench
        </button>
        <button
          onClick={() => onPick(null)}
          className="h-14 rounded-xl border-2 border-slate-300 text-lg font-semibold text-slate-700 active:bg-slate-100"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
