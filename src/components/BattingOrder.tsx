"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { moveBatter } from "@/lib/lineup/edit";
import type { Player } from "@/lib/rules/types";

const ROW = 64; // row height (56px) + gap (8px)

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** Drag the handle to reorder (touch or mouse); arrow keys also move a focused handle. */
export function BattingOrder({
  order,
  players,
  onChange,
}: {
  order: string[];
  players: Map<string, Player>;
  onChange: (order: string[]) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);
  const target = drag
    ? Math.max(0, Math.min(order.length - 1, drag.from + Math.round(drag.dy / ROW)))
    : -1;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    setDrag({ from: i, dy: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag) setDrag({ ...drag, dy: e.clientY - startY.current });
  };
  const onPointerUp = () => {
    if (drag && target !== drag.from) onChange(moveBatter(order, drag.from, target));
    setDrag(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
    if (to === null || to < 0 || to >= order.length) return;
    e.preventDefault();
    onChange(moveBatter(order, i, to));
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-handle="${to}"]`)?.focus(),
    );
  };

  const offset = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < target && i > drag.from && i <= target) return -ROW;
    if (target < drag.from && i >= target && i < drag.from) return ROW;
    return 0;
  };

  return (
    <div>
      <p className="mb-3 text-base text-slate-700">Drag ☰ to change the order. Everyone bats.</p>
      <ol className="flex flex-col gap-2">
        {order.map((id, i) => {
          const p = players.get(id);
          const dragging = drag?.from === i;
          return (
            <li
              key={id}
              style={{ transform: `translateY(${offset(i)}px)` }}
              className={`flex h-14 items-center gap-3 rounded-xl border-2 bg-white pl-3 ${
                dragging
                  ? "relative z-10 border-[#0b1f3a] shadow-xl"
                  : "border-slate-200 transition-transform"
              }`}
            >
              <span className="w-10 text-lg font-bold text-slate-600">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-lg font-semibold">
                {p?.name ?? id}{" "}
                <span className="font-normal text-slate-600">#{p?.jerseyNumber ?? "–"}</span>
              </span>
              <button
                data-handle={i}
                aria-label={`Move ${p?.name ?? id}, batting ${ordinal(i + 1)}. Use arrow keys.`}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="flex h-full w-14 shrink-0 cursor-grab touch-none items-center justify-center rounded-r-xl text-2xl text-slate-500 select-none active:cursor-grabbing active:bg-slate-100"
              >
                ☰
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
