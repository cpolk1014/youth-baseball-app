"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGameDate, gameContext, gameResult, lastFilledInning } from "@/lib/data/game";
import {
  saveGame,
  saveLineup,
  setGameResult,
  setGameStatus,
  setLineupStyle,
  useAppData,
} from "@/lib/data/store";
import { battingOrderMessage } from "@/lib/groupme/messages";
import { assignPosition, positionAt, setAbsent, setBatting } from "@/lib/lineup/edit";
import { rotateLeadoff } from "@/lib/rules/custom";
import { competitivePlan } from "@/lib/rules/competitive";
import { explainLineup } from "@/lib/rules/explain";
import { explainCompetitive } from "@/lib/rules/explainCompetitive";
import { generateLineup } from "@/lib/rules/generate";
import type { Lineup } from "@/lib/rules/types";
import { validateLineup } from "@/lib/rules/validate";
import { ROLE_LABEL, isCoach, permissionsFor } from "@/lib/data/permissions";
import { statLines } from "@/lib/stats/profile";
import { AppShell, Loading } from "./AppShell";
import { Attendance } from "./Attendance";
import { BattingOrder } from "./BattingOrder";
import { GameForm } from "./GameForm";
import { GroupMePost } from "./GroupMePost";
import { ShareBattingCard } from "./ShareBattingCard";
import { LineupGrid } from "./LineupGrid";
import { PositionPicker } from "./PositionPicker";
import { Sheet } from "./Sheet";
import { useTeamStats } from "./stats/statsData";
import { ViolationList } from "./ViolationList";
import { WhyLineup } from "./WhyLineup";

type View = "field" | "batting" | "attendance";

export function GameScreen({ gameId }: { gameId: string }) {
  const data = useAppData();
  const [view, setView] = useState<View>("field");
  const [cell, setCell] = useState<{ playerId: string; inning: number } | null>(null);
  const [undo, setUndo] = useState<Lineup | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [score, setScore] = useState<{ us: number | null; them: number | null }>({
    us: null,
    them: null,
  });
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Only coaches and managers can see stats (the database enforces it).
  const seesStats = !!data && (isCoach(data.me.role) || data.me.role === "manager");
  const stats = useTeamStats(data?.season.id ?? "", seesStats);

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

  const { game, config, lineup, history, previous } = ctx;
  const players = new Map(data.players.map((p) => [p.id, p]));
  const violations = validateLineup(data.players, lineup, config, history, previous);
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
  const style = game.lineupStyle ?? "fair";
  const absent = new Set(lineup.absent ?? []);
  const active = data.players.filter((p) => p.active !== false && !absent.has(p.id));
  const lines = stats.stats ? statLines(stats.stats.data) : null;
  const hasStats = !!lines && lines.size > 0;
  const plan = hasStats ? competitivePlan(active, lines) : null;
  const importedOn = stats.stats
    ? new Date(stats.stats.importedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const leadoffRule = (setting: "block" | "any") =>
    config.custom.some(
      (r) =>
        r.kind === "leadoff-rotation" &&
        (setting === "any" ? r.setting !== "off" : r.setting === "block"),
    );

  const autoFill = () => {
    const seed = ctx.autoFillSeed + 1;
    if (style === "competitive" && plan) {
      const { lineup: generated } = generateLineup(active, config, history, seed, {
        innings: game.innings,
        previous,
        competitive: plan,
      });
      // The stats set the batting order; kids who aren't here keep a place at the end.
      const order = [
        ...generated.battingOrder,
        ...lineup.battingOrder.filter((id) => !generated.battingOrder.includes(id)),
      ];
      change(
        {
          ...generated,
          battingOrder: leadoffRule("block")
            ? rotateLeadoff(order, previous?.battingOrder[0])
            : order,
          notBatting: lineup.notBatting ?? [],
          absent: lineup.absent ?? [],
        },
        seed,
      );
      return;
    }
    const { lineup: generated } = generateLineup(active, config, history, seed, {
      innings: game.innings,
      previous,
    });
    // Keep the coach's batting order; auto-fill only sets the field.
    change(
      {
        ...generated,
        // Keep the coach's order, but if their leadoff-rotation rule is on, don't lead off
        // with last game's leadoff hitter.
        battingOrder: leadoffRule("any")
          ? rotateLeadoff(lineup.battingOrder, previous?.battingOrder[0])
          : lineup.battingOrder,
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
  // Mark final (or fix the score of a final game): always asks for the score.
  const markFinal = () => {
    setScore({ us: game.scoreUs ?? null, them: game.scoreThem ?? null });
    setConfirmFinal(true);
  };
  const result = gameResult(game);

  return (
    <AppShell
      title={`vs ${game.opponent}`}
      subtitle={`${formatGameDate(game)} · ${game.innings} inn`}
      backHref="/games"
      tab="games"
      action={
        <Link
          href={`/games/${game.id}/card`}
          className="flex h-11 shrink-0 items-center rounded-lg bg-white px-3 text-base font-bold text-[var(--team)] active:bg-slate-200"
        >
          Print card
        </Link>
      }
    >
      {isFinal ? (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl p-3 text-white ${
            result === "W" ? "bg-green-700" : result === "L" ? "bg-red-700" : "bg-slate-700"
          }`}
        >
          <p className="min-w-0 flex-1 text-base leading-snug font-semibold">
            {result ? (
              <span className="block text-2xl font-black">
                {result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"} {game.scoreUs}–
                {game.scoreThem}
              </span>
            ) : null}
            Final. This lineup counts toward season playing time.
          </p>
          {perms.editTeam && (
            <div className="flex gap-2">
              <button
                onClick={markFinal}
                className="h-11 shrink-0 rounded-lg bg-white/15 px-3 text-base font-bold text-white active:bg-white/25"
              >
                {result ? "Edit score" : "Add score"}
              </button>
              <button
                onClick={() => setGameStatus(game.id, "scheduled")}
                className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-slate-900 active:bg-slate-200"
              >
                Reopen
              </button>
            </div>
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
          {lineup.battingOrder.length > 0 && (
            <button
              onClick={() => setSharing(true)}
              className="col-span-2 h-12 rounded-xl border-2 border-[var(--team)] bg-white text-base font-bold text-[var(--team)] active:bg-slate-100"
            >
              Share batting order picture
            </button>
          )}
          {data.groupme && lineup.battingOrder.length > 0 && (
            <button
              onClick={() => setPosting(true)}
              className="col-span-2 h-12 rounded-xl bg-[#00aff0] text-base font-bold text-white active:bg-[#0096cc]"
            >
              Post batting order to GroupMe
            </button>
          )}
        </div>
      )}

      <div
        role="tablist"
        className="mb-4 grid grid-cols-3 rounded-xl border-2 border-[var(--team)] p-1"
      >
        {(["field", "batting", "attendance"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-11 rounded-lg text-base font-bold ${view === v ? "bg-[var(--team)] text-white" : "text-[var(--team)]"}`}
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
          {!lineupLocked && (
            <div className="mb-3">
              <div
                role="radiogroup"
                aria-label="How auto-fill builds the lineup"
                className="grid grid-cols-2 gap-2"
              >
                {(["fair", "competitive"] as const).map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={style === s}
                    disabled={s === "competitive" && !hasStats && style !== "competitive"}
                    onClick={() => setLineupStyle(game.id, s)}
                    className={`min-h-12 rounded-xl px-2 py-1 text-base font-bold disabled:opacity-40 ${
                      style === s
                        ? "bg-[var(--team)] text-white"
                        : "border-2 border-slate-300 bg-white text-slate-800 active:bg-slate-100"
                    }`}
                  >
                    {s === "fair" ? "Fair play" : "Competitive"}
                    <span className="block text-xs font-semibold opacity-80">
                      {s === "fair" ? "Everyone plays evenly" : "From GameChanger stats"}
                    </span>
                  </button>
                ))}
              </div>
              {!hasStats && !stats.loading && (
                <p className="mt-2 text-sm text-slate-700">
                  {seesStats ? (
                    <>
                      To build a competitive lineup,{" "}
                      <Link href="/stats" className="font-semibold underline">
                        import GameChanger stats
                      </Link>{" "}
                      first.
                    </>
                  ) : (
                    "Competitive lineups use GameChanger stats, which coaches and managers import."
                  )}
                </p>
              )}
            </div>
          )}
          <div className={`mb-3 flex gap-2 ${lineupLocked ? "hidden" : ""}`}>
            <button
              onClick={autoFill}
              disabled={style === "competitive" && !plan}
              className="h-14 flex-1 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
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
                Tap <b>Auto-fill</b> for a {style === "competitive" ? "competitive" : "fair"}{" "}
                lineup, or tap any square to set a position.
              </p>
            ) : (
              <>
                <ViolationList violations={shown} emptyCells={emptyCells} />
                <WhyLineup
                  explanation={
                    style === "competitive"
                      ? explainCompetitive(
                          data.players,
                          lineup,
                          config,
                          violations,
                          plan,
                          importedOn,
                        )
                      : explainLineup(data.players, lineup, config, history, violations)
                  }
                />
              </>
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

      <Sheet open={sharing} title="Batting order picture" onClose={() => setSharing(false)}>
        {sharing && <ShareBattingCard data={data} game={game} lineup={lineup} />}
      </Sheet>

      <Sheet open={posting} title="Post batting order" onClose={() => setPosting(false)}>
        {posting && (
          <GroupMePost
            rows={12}
            initialText={battingOrderMessage({
              opponent: game.opponent,
              when: formatGameDate(game),
              location: game.location,
              players: data.players,
              lineup,
            })}
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

      <Sheet
        open={confirmFinal}
        title={isFinal ? "Final score" : "Mark game final"}
        onClose={() => setConfirmFinal(false)}
      >
        {!isFinal && (lineup.slots.length === 0 || blocks > 0 || emptyCells > 0) && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-base leading-snug text-amber-950">
            {lineup.slots.length === 0
              ? "There's no lineup for this game, so it won't add any innings to season playing time."
              : `This lineup still has ${[
                  emptyCells > 0 ? `${emptyCells} empty spot${emptyCells === 1 ? "" : "s"}` : "",
                  blocks > 0 ? `${blocks} fair-play problem${blocks === 1 ? "" : "s"}` : "",
                ]
                  .filter(Boolean)
                  .join(" and ")}. Season playing time will count it as it is.`}
          </p>
        )}
        <p className="mb-2 text-base font-semibold">Final score (optional)</p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <ScoreInput
            label={data.team.name}
            value={score.us}
            onChange={(us) => setScore({ ...score, us })}
          />
          <ScoreInput
            label={game.opponent}
            value={score.them}
            onChange={(them) => setScore({ ...score, them })}
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmFinal(false)}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            {isFinal ? "Cancel" : "Keep editing"}
          </button>
          <button
            onClick={() => {
              const both = score.us !== null && score.them !== null;
              setGameResult(game.id, "final", both ? score.us : null, both ? score.them : null);
              setConfirmFinal(false);
            }}
            className="h-14 flex-1 rounded-xl bg-slate-700 text-lg font-bold text-white active:bg-slate-800"
          >
            {isFinal ? "Save score" : "Mark final"}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}

/** A big, thumb-friendly score box: − number +, empty until tapped. */
function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const btn =
    "flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold active:bg-slate-100 disabled:opacity-30";
  return (
    <div className="rounded-xl border-2 border-slate-200 p-2">
      <p className="mb-1 truncate text-center text-sm font-semibold text-slate-700">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <button
          aria-label={`Lower ${label} score`}
          disabled={value !== null && value <= 0}
          onClick={() => onChange(value === null ? 0 : value - 1)}
          className={btn}
        >
          −
        </button>
        <span className="text-3xl font-black tabular-nums">{value ?? "–"}</span>
        <button
          aria-label={`Raise ${label} score`}
          disabled={value !== null && value >= 99}
          onClick={() => onChange(value === null ? 1 : value + 1)}
          className={btn}
        >
          +
        </button>
      </div>
    </div>
  );
}
