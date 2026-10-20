"use client";

import { useState } from "react";
import { formatGameDate, gameContext } from "@/lib/data/game";
import { saveLineup, useAppData } from "@/lib/data/store";
import { assignPosition, positionAt } from "@/lib/lineup/edit";
import { generateLineup } from "@/lib/rules/generate";
import type { Lineup } from "@/lib/rules/types";
import { validateLineup } from "@/lib/rules/validate";
import { AppShell, Loading } from "./AppShell";
import { BattingOrder } from "./BattingOrder";
import { LineupGrid } from "./LineupGrid";
import { PositionPicker } from "./PositionPicker";
import { Sheet } from "./Sheet";
import { ViolationList } from "./ViolationList";

type View = "field" | "batting";

export function GameScreen({ gameId }: { gameId: string }) {
  const data = useAppData();
  const [view, setView] = useState<View>("field");
  const [cell, setCell] = useState<{ playerId: string; inning: number } | null>(null);
  const [undo, setUndo] = useState<Lineup | null>(null);

  if (!data) {
    return (
      <AppShell title="Lineup" backHref="/games" tab="games">
        <Loading />
      </AppShell>
    );
  }
  const ctx = gameContext(data, gameId);
  if (!ctx) {
    return (
      <AppShell title="Game not found" backHref="/games" tab="games">
        <p className="text-lg">This game doesn&apos;t exist.</p>
      </AppShell>
    );
  }

  const { game, config, lineup, history } = ctx;
  const players = new Map(data.players.map((p) => [p.id, p]));
  const violations = validateLineup(data.players, lineup, config, history);
  // Empty cells are counted separately rather than listed one by one.
  const isEmptyCell = (v: (typeof violations)[number]) =>
    v.rule === "player-assignment" &&
    v.playerId !== undefined &&
    v.inning !== undefined &&
    positionAt(lineup, v.inning, v.playerId) === null;
  const emptyCells = violations.filter(isEmptyCell).length;
  const shown = lineup.slots.length === 0 ? [] : violations.filter((v) => !isEmptyCell(v));

  const change = (next: Lineup, seed?: number) => {
    setUndo(lineup);
    saveLineup(game.id, next, seed);
  };
  const autoFill = () => {
    const seed = ctx.autoFillSeed + 1;
    const active = data.players.filter((p) => p.active !== false);
    const { lineup: generated } = generateLineup(active, config, history, seed, {
      innings: game.innings,
    });
    // Keep the coach's batting order; auto-fill only sets the field.
    change({ ...generated, battingOrder: lineup.battingOrder }, seed);
  };
  const picked = cell ? players.get(cell.playerId) : undefined;

  return (
    <AppShell
      title={`vs ${game.opponent}`}
      subtitle={`${formatGameDate(game)} · ${game.innings} inn`}
      backHref="/games"
      tab="games"
    >
      <div
        role="tablist"
        className="mb-4 grid grid-cols-2 rounded-xl border-2 border-[#0b1f3a] p-1"
      >
        {(["field", "batting"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-11 rounded-lg text-base font-bold ${view === v ? "bg-[#0b1f3a] text-white" : "text-[#0b1f3a]"}`}
          >
            {v === "field" ? "Field" : "Batting order"}
          </button>
        ))}
      </div>

      {view === "field" ? (
        <>
          <div className="mb-3 flex gap-2">
            <button
              onClick={autoFill}
              className="h-14 flex-1 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800"
            >
              {lineup.slots.length ? "Auto-fill again" : "Auto-fill"}
            </button>
            <button
              onClick={() => {
                if (undo) saveLineup(game.id, undo);
                setUndo(null);
              }}
              disabled={!undo}
              className="h-14 w-20 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={() => change({ ...lineup, slots: [] })}
              disabled={lineup.slots.length === 0}
              className="h-14 w-20 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          <LineupGrid
            lineup={lineup}
            players={players}
            positions={config.fieldPositions}
            violations={shown}
            onCellTap={(playerId, inning) => setCell({ playerId, inning })}
          />

          <div className="mt-4">
            {lineup.slots.length === 0 ? (
              <p className="rounded-xl border-2 border-slate-300 bg-white p-4 text-base">
                Tap <b>Auto-fill</b> for a fair lineup, or tap any square to set a position.
              </p>
            ) : (
              <ViolationList violations={shown} emptyCells={emptyCells} />
            )}
          </div>
        </>
      ) : (
        <BattingOrder
          order={lineup.battingOrder}
          players={players}
          onChange={(battingOrder) => change({ ...lineup, battingOrder })}
        />
      )}

      <Sheet
        open={cell !== null && picked !== undefined}
        title={picked && cell ? `${picked.name} · Inning ${cell.inning}` : ""}
        onClose={() => setCell(null)}
      >
        {cell && picked && (
          <PositionPicker
            lineup={lineup}
            inning={cell.inning}
            player={picked}
            players={players}
            positions={config.fieldPositions}
            onPick={(pos) => {
              change(assignPosition(lineup, cell.inning, cell.playerId, pos));
              setCell(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
