"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGameDate, gameContext, lastFilledInning } from "@/lib/data/game";
import { saveGame, saveLineup, setGameStatus, useAppData } from "@/lib/data/store";
import { assignPosition, positionAt, setAbsent, setBatting } from "@/lib/lineup/edit";
import { generateLineup } from "@/lib/rules/generate";
import type { Lineup } from "@/lib/rules/types";
import { validateLineup } from "@/lib/rules/validate";
import { ROLE_LABEL, permissionsFor } from "@/lib/data/permissions";
import { AppShell, Loading } from "./AppShell";
import { Attendance } from "./Attendance";
import { BattingOrder } from "./BattingOrder";
import { GameForm } from "./GameForm";
import { LineupGrid } from "./LineupGrid";
import { PositionPicker } from "./PositionPicker";
import { Sheet } from "./Sheet";
import { ViolationList } from "./ViolationList";

type View = "field" | "batting" | "attendance";

export function GameScreen({ gameId }: { gameId: string }) {
  const data = useAppData();
  const [view, setView] = useState<View>("field");
  const [cell, setCell] = useState<{ playerId: string; inning: number } | null>(null);
  const [undo, setUndo] = useState<Lineup | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);

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
    const absent = new Set(lineup.absent ?? []);
    const active = data.players.filter((p) => p.active !== false && !absent.has(p.id));
    const { lineup: generated } = generateLineup(active, config, history, seed, {
      innings: game.innings,
    });
    // Keep the coach's batting order; auto-fill only sets the field.
    change(
      {
        ...generated,
        battingOrder: lineup.battingOrder,
        notBatting: lineup.notBatting ?? [],
        absent: lineup.absent ?? [],
      },
      seed,
    );
  };
  const picked = cell ? players.get(cell.playerId) : undefined;
  const isFinal = game.status === "final";
  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  // Lineups are editable by coaches, and only until the game is final.
  const lineupLocked = isFinal || !perms.editLineups;
  const absentNames = (lineup.absent ?? []).map((id) => players.get(id)?.name ?? id);
  const rosterCount = data.players.filter((p) => p.active !== false).length;
  const hereCount = rosterCount - absentNames.length;
  const blocks = shown.filter((v) => v.severity === "block").length;
  const markFinal = () => {
    if (lineup.slots.length === 0 || blocks > 0 || emptyCells > 0) setConfirmFinal(true);
    else setGameStatus(game.id, "final");
  };

  return (
    <AppShell
      title={`vs ${game.opponent}`}
      subtitle={`${formatGameDate(game)} · ${game.innings} inn`}
      backHref="/games"
      tab="games"
      action={
        <Link
          href={`/games/${game.id}/card`}
          className="flex h-11 shrink-0 items-center rounded-lg bg-white px-3 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
        >
          Print card
        </Link>
      }
    >
      {isFinal ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-700 p-3 text-white">
          <p className="flex-1 text-base leading-snug font-semibold">
            Final. This lineup counts toward season playing time.
          </p>
          {perms.editTeam && (
            <button
              onClick={() => setGameStatus(game.id, "scheduled")}
              className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-slate-900 active:bg-slate-200"
            >
              Reopen
            </button>
          )}
        </div>
      ) : !perms.editTeam ? (
        <p className="mb-4 rounded-xl bg-slate-200 px-3 py-2 text-base">
          View only · you&apos;re on this team as a {ROLE_LABEL[data.me.role].toLowerCase()}.
        </p>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setEditing(true)}
            className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
          >
            Edit game
          </button>
          <button
            onClick={markFinal}
            className="h-12 rounded-xl border-2 border-slate-700 bg-white text-base font-bold active:bg-slate-100"
          >
            Mark final
          </button>
        </div>
      )}

      <div
        role="tablist"
        className="mb-4 grid grid-cols-3 rounded-xl border-2 border-[#0b1f3a] p-1"
      >
        {(["field", "batting", "attendance"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-11 rounded-lg text-base font-bold ${view === v ? "bg-[#0b1f3a] text-white" : "text-[#0b1f3a]"}`}
          >
            {v === "field"
              ? "Field"
              : v === "batting"
                ? "Batting"
                : `Here ${hereCount}/${rosterCount}`}
          </button>
        ))}
      </div>

      {view === "field" ? (
        <>
          <div className={`mb-3 flex gap-2 ${lineupLocked ? "hidden" : ""}`}>
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

          {absentNames.length > 0 && (
            <p className="mb-3 rounded-xl bg-slate-200 px-3 py-2 text-base">
              <b>Absent:</b> {absentNames.join(", ")}
              {!lineupLocked && lineup.slots.length > 0 && emptyCells > 0 && (
                <>
                  {" "}
                  · Their spots are open. Tap <b>Auto-fill again</b> or fill them in.
                </>
              )}
            </p>
          )}

          <LineupGrid
            lineup={lineup}
            players={players}
            positions={config.fieldPositions}
            violations={shown}
            onCellTap={
              lineupLocked ? undefined : (playerId, inning) => setCell({ playerId, inning })
            }
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
      ) : view === "attendance" ? (
        <Attendance
          players={data.players}
          absent={lineup.absent ?? []}
          onSetAbsent={(playerId, isAbsent) => change(setAbsent(lineup, playerId, isAbsent))}
          readOnly={lineupLocked}
        />
      ) : (
        <BattingOrder
          order={lineup.battingOrder}
          notBatting={lineup.notBatting ?? []}
          players={players}
          onChange={(battingOrder) => change({ ...lineup, battingOrder })}
          onSetBatting={(playerId, bats) => change(setBatting(lineup, playerId, bats))}
          readOnly={lineupLocked}
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

      <Sheet open={editing} title="Edit game" onClose={() => setEditing(false)}>
        {editing && (
          <GameForm
            game={game}
            filledInnings={lastFilledInning(data.lineups[game.id])}
            onCancel={() => setEditing(false)}
            onSave={(g) => {
              saveGame(g);
              setUndo(null);
              setEditing(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={confirmFinal} title="Mark game final?" onClose={() => setConfirmFinal(false)}>
        <p className="mb-4 text-lg leading-snug">
          {lineup.slots.length === 0
            ? "There's no lineup for this game, so it won't add any innings to season playing time."
            : `This lineup still has ${[
                emptyCells > 0 ? `${emptyCells} empty spot${emptyCells === 1 ? "" : "s"}` : "",
                blocks > 0 ? `${blocks} fair-play problem${blocks === 1 ? "" : "s"}` : "",
              ]
                .filter(Boolean)
                .join(" and ")}. Season playing time will count it as it is.`}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmFinal(false)}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Keep editing
          </button>
          <button
            onClick={() => {
              setGameStatus(game.id, "final");
              setConfirmFinal(false);
            }}
            className="h-14 flex-1 rounded-xl bg-slate-700 text-lg font-bold text-white active:bg-slate-800"
          >
            Mark final
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
