"use client";

import { useEffect, useRef, useState } from "react";
import { holdersByPosition, lineupRows, positionAt } from "@/lib/lineup/edit";
import type { FieldPosition, Lineup, Player, Severity, Violation } from "@/lib/rules/types";
import { positionClass, positionLabel } from "./positionStyle";
import { useMinWidth } from "./shell/useWide";

const RING: Record<Severity, string> = {
  block: "ring-4 ring-red-600",
  warn: "ring-4 ring-amber-400",
};

function worst(a: Severity | undefined, b: Severity): Severity {
  return a === "block" || b === "block" ? "block" : "warn";
}

type Cell = { playerId: string; inning: number };

/** How far (px) a mouse moves before it's a drag, and how long (ms) a finger holds first. */
const DRAG_PX = 5;
const HOLD_MS = 280;

/**
 * Drag one cell onto another in the same inning to swap the two players' spots: mouse drag
 * on computers, press-and-hold then drag on touch screens. Wide screens only; phones tap.
 */
function useCellDrag(enabled: boolean, onSwap?: (inning: number, a: string, b: string) => void) {
  const [drag, setDrag] = useState<(Cell & { active: boolean }) | null>(null);
  const [over, setOver] = useState<Cell | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const holdTimer = useRef<number | null>(null);
  // A drop is followed by a click on the cell under the pointer; don't open the picker.
  const justDropped = useRef(false);

  useEffect(() => {
    if (!drag) return;
    const cellAt = (x: number, y: number): Cell | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
      if (!el) return null;
      return { playerId: el.dataset.player!, inning: Number(el.dataset.inning) };
    };
    const end = () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      setDrag(null);
      setOver(null);
      setGhost(null);
      start.current = null;
    };
    const onMove = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      if (!drag.active) {
        // A finger that moves before the hold is a scroll, not a drag.
        if (s.touch) {
          if (moved > 8) end();
          return;
        }
        if (moved < DRAG_PX) return;
        setDrag({ ...drag, active: true });
      }
      setGhost({ x: e.clientX, y: e.clientY });
      const c = cellAt(e.clientX, e.clientY);
      setOver(c && c.inning === drag.inning && c.playerId !== drag.playerId ? c : null);
    };
    const onUp = () => {
      if (drag.active) {
        justDropped.current = true;
        window.setTimeout(() => (justDropped.current = false), 50);
        if (over) onSwap?.(drag.inning, drag.playerId, over.playerId);
      }
      end();
    };
    // While dragging with a finger, the page mustn't scroll.
    const onTouchMove = (e: TouchEvent) => {
      if (drag.active) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [drag, over, onSwap]);

  const on = enabled && !!onSwap;
  const begin = (cell: Cell, e: React.PointerEvent) => {
    if (!on || e.button !== 0) return;
    const touch = e.pointerType !== "mouse";
    start.current = { x: e.clientX, y: e.clientY, touch };
    setDrag({ ...cell, active: false });
    if (touch) {
      holdTimer.current = window.setTimeout(() => {
        setDrag({ ...cell, active: true });
        setGhost({ x: start.current?.x ?? e.clientX, y: start.current?.y ?? e.clientY });
        navigator.vibrate?.(10);
      }, HOLD_MS);
    }
  };
  return { on, drag: drag?.active ? drag : null, over, ghost, begin, justDropped };
}

/** Players (batting order) × innings. Tap a cell to set the position; drag to swap. */
export function LineupGrid({
  lineup,
  players,
  positions,
  violations,
  onCellTap,
  onSwap,
}: {
  lineup: Lineup;
  players: Map<string, Player>;
  positions: FieldPosition[];
  violations: Violation[];
  /** Omit for a read-only grid (e.g. a final game). */
  onCellTap?: (playerId: string, inning: number) => void;
  /** Wide screens: a cell was dragged onto another player's cell in the same inning. */
  onSwap?: (inning: number, a: string, b: string) => void;
}) {
  const wide = useMinWidth(1024);
  const { on: dragOn, drag, over, ghost, begin, justDropped } = useCellDrag(wide, onSwap);
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

  const ghostPos = drag ? positionAt(lineup, drag.inning, drag.playerId) : null;
  return (
    <div className={`-mx-4 overflow-x-auto px-2 lg:mx-0 lg:px-0 ${drag ? "cursor-grabbing" : ""}`}>
      {drag && ghost && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 flex h-12 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg text-lg font-black shadow-xl ring-2 ring-white ${positionClass(ghostPos)}`}
          style={{ left: ghost.x, top: ghost.y }}
        >
          {positionLabel(ghostPos)}
        </div>
      )}
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
                  const dragging = drag?.playerId === id && drag.inning === inning;
                  const target = over?.playerId === id && over.inning === inning;
                  const sameInning = drag !== null && drag.inning === inning && !dragging;
                  return (
                    <td key={inning} className="p-0">
                      <button
                        data-cell
                        data-player={id}
                        data-inning={inning}
                        onPointerDown={(e) => begin({ playerId: id, inning }, e)}
                        onContextMenu={dragOn ? (e) => e.preventDefault() : undefined}
                        onClick={
                          onCellTap
                            ? () => {
                                if (!justDropped.current) onCellTap(id, inning);
                              }
                            : undefined
                        }
                        disabled={!onCellTap}
                        aria-label={`${p?.name ?? id}, inning ${inning}: ${pos ?? "not set"}`}
                        className={`flex h-11 w-full min-w-[38px] items-center justify-center rounded-md text-[15px] font-bold transition-transform select-none ${positionClass(pos)} ${
                          target
                            ? "scale-110 ring-4 ring-sky-500"
                            : dragging
                              ? "opacity-40"
                              : sameInning
                                ? "ring-2 ring-sky-300"
                                : sev
                                  ? RING[sev]
                                  : ""
                        } ${dragOn ? "cursor-grab [-webkit-touch-callout:none] lg:h-12" : ""}`}
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
