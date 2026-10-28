"use client";

import { holdersByPosition, positionAt } from "@/lib/lineup/edit";
import type { FieldPosition, Lineup, Player, Position } from "@/lib/rules/types";

/** Where each position sits on the drawing, as % of its width and height (home plate at the bottom). */
const SPOT: Record<FieldPosition, [number, number]> = {
  LF: [15, 30],
  LCF: [36, 13],
  CF: [50, 12],
  RCF: [64, 13],
  RF: [85, 30],
  SS: [33, 47],
  "2B": [67, 47],
  "3B": [17, 66],
  P: [50, 63],
  "1B": [83, 66],
  C: [50, 90],
};

/** A simple field: outfield grass, infield dirt, bases. Decorative only. */
function FieldBackground() {
  return (
    <svg
      viewBox="0 0 100 95"
      aria-hidden="true"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full rounded-2xl"
    >
      <rect width="100" height="95" fill="#3f7a32" />
      <path d="M50,92 L2,44 A68,68 0 0 1 98,44 Z" fill="#4f8a3c" />
      <path d="M50,94 L26,70 A30,30 0 0 1 74,70 Z" fill="#c98a55" />
      <polygon points="50,84 66,66 50,49 34,66" fill="#4f8a3c" />
      <g fill="#f8f6ef">
        <rect x="64.5" y="64.5" width="3" height="3" transform="rotate(45 66 66)" />
        <rect x="48.5" y="47.5" width="3" height="3" transform="rotate(45 50 49)" />
        <rect x="32.5" y="64.5" width="3" height="3" transform="rotate(45 34 66)" />
        <path d="M48.5,83 h3 v1.5 l-1.5,1.5 l-1.5,-1.5 z" />
      </g>
      <line x1="50" y1="84" x2="2" y2="36" stroke="#f8f6ef" strokeWidth="0.5" />
      <line x1="50" y1="84" x2="98" y2="36" stroke="#f8f6ef" strokeWidth="0.5" />
    </svg>
  );
}

/** One player's spot for one inning, picked on a drawing of the field; shows who holds each spot. */
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
      return { text: players.get(holder)?.name.split(" ")[0] ?? "taken" };
    if (holder === player.id) return { text: player.name.split(" ")[0] ?? "current" };
    return { text: "open" };
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">Tap a spot. If someone&apos;s there, they swap.</p>
      <div className="relative mx-auto aspect-[1/0.95] w-full max-w-md">
        <FieldBackground />
        {positions.map((pos) => {
          const n = note(pos);
          const selected = current === pos;
          const [x, y] = SPOT[pos];
          return (
            <button
              key={pos}
              onClick={() => onPick(pos)}
              aria-pressed={selected}
              aria-label={`${pos}: ${n.text}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute flex h-[3.25rem] w-[5.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-2 shadow-md ${
                selected
                  ? "border-amber-400 bg-[#0b1f3a] text-white ring-2 ring-amber-400"
                  : "border-white bg-white/95 active:bg-slate-100"
              }`}
            >
              <span className="text-lg leading-none font-bold">{pos}</span>
              <span
                className={`mt-0.5 max-w-full truncate px-1 text-xs font-semibold ${selected ? "text-white/85" : n.bad ? "text-red-700" : n.text === "open" ? "text-green-800" : "text-slate-700"}`}
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
