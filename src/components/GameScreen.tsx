"use client";

import { usePlan } from "./paywall";
import Link from "next/link";
import { useState } from "react";
import {
  arriveBy,
  formatGameDate,
  gameContext,
  gameResult,
  lastFilledInning,
  recentPlaces,
  placeLabel,
} from "@/lib/data/game";
import {
  saveGame,
  saveLineup,
  setGameResult,
  setGameStatus,
  setLineupStyle,
  useAppData,
} from "@/lib/data/store";
import { battingOrderMessage } from "@/lib/groupme/messages";
import { assignPosition, positionAt, setAbsent, setBatting, swapInInning } from "@/lib/lineup/edit";
import { rotateLeadoff } from "@/lib/rules/custom";
import { competitivePlan } from "@/lib/rules/competitive";
import { explainLineup } from "@/lib/rules/explain";
import { explainCompetitive } from "@/lib/rules/explainCompetitive";
import { generateLineup } from "@/lib/rules/generate";
import type { Lineup } from "@/lib/rules/types";
import { validateLineup } from "@/lib/rules/validate";
import { ROLE_LABEL, isCoach, permissionsFor } from "@/lib/data/permissions";
import { statLines } from "@/lib/stats/profile";
import { boxSeasonLines, recentFromBoxScores, recentFromImports } from "@/lib/stats/form";
import { computeParticipation } from "@/lib/rules/participation";
import type { FieldPosition } from "@/lib/rules/types";
import { GameBoxScore } from "./boxscore/GameBoxScore";
import { useSeasonBoxScores, useStatsImports } from "./boxscore/boxData";
import { AppShell, Loading } from "./AppShell";
import { Attendance } from "./Attendance";
import { BattingOrder } from "./BattingOrder";
import { GameDeleteSection } from "./GameDeleteSection";
import { GameForm } from "./GameForm";
import { ParentGame } from "./ParentGame";
import { toast } from "./shell/Toast";
import { Shortcut } from "./shell/useShortcut";
import { GamesPane } from "./GamesScreen";
import { GroupMePost } from "./GroupMePost";
import { ShareBattingCard } from "./ShareBattingCard";
import { LineupGrid } from "./LineupGrid";
import { MidInningSheet } from "./MidInningSheet";
import { splitInnings } from "@/lib/rules/outs";
import { PositionPicker } from "./PositionPicker";
import { Sheet } from "./Sheet";
import { useTeamStats } from "./stats/statsData";
import { ViolationList } from "./ViolationList";
import { GamePlaceCard } from "./GamePlaceCard";
import { WeatherCard } from "./Weather";
import { TournamentTag } from "./tournaments/TournamentTag";
import { GameUniformCard } from "./uniforms/GameUniformCard";
import { gameUniformShown } from "@/lib/uniforms";
import { WhyLineup } from "./WhyLineup";

type View = "field" | "batting" | "attendance";

export function GameScreen({ gameId }: { gameId: string }) {
  const data = useAppData();
  const [view, setView] = useState<View>("field");
  const [cell, setCell] = useState<{ playerId: string; inning: number } | null>(null);
  // A change in the middle of an inning (and who it started from, when opened from a square).
  // inning 0 = pick the inning first (from the Mid-inning change button).
  const [midInning, setMidInning] = useState<{ inning: number; playerId?: string } | null>(null);
  const [undo, setUndo] = useState<Lineup | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [score, setScore] = useState<{ us: number | null; them: number | null }>({
    us: null,
    them: null,
  });
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Competitive lineups are a paid feature.
  const { paid } = usePlan();
  // Only coaches and managers can see stats (the database enforces it).
  const seesStats = !!data && (isCoach(data.me.role) || data.me.role === "manager");
  const stats = useTeamStats(data?.season.id ?? "", seesStats);
  // The team's box scores (stats and pitch counts) and every past import (for streaks).
  const box = useSeasonBoxScores(data?.season.id ?? "", seesStats);
  const imports = useStatsImports(data?.season.id ?? "", seesStats);

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
  // Season numbers: GameChanger's import when there is one (it's complete), else the team's
  // box scores (fielding innings from Fungo's own lineups).
  const csvLines = stats.stats ? statLines(stats.stats.data) : null;
  const boxLines = box.lines.filter((l) => l.playerId);
  const useBox = !(csvLines && csvLines.size > 0) && boxLines.some((l) => !l.pitchOnly);
  const lines = useBox
    ? boxSeasonLines(
        boxLines,
        Object.fromEntries(
          Object.entries(computeParticipation(history, [])).map(([id, p]) => [
            id,
            Object.fromEntries(
              Object.entries(p.byPosition).filter(([pos]) => pos !== "BENCH"),
            ) as Partial<Record<FieldPosition, number>>,
          ]),
        ),
      )
    : csvLines;
  const hasStats = !!lines && lines.size > 0;
  // Lately: the last two weeks of box scores, or the latest import minus an earlier one.
  const fromBox = recentFromBoxScores(boxLines, game.date);
  const recent = fromBox.size > 0 ? fromBox : recentFromImports(imports);
  const plan = hasStats ? competitivePlan(active, lines, recent) : null;
  const boxGames = new Set(boxLines.filter((l) => !l.pitchOnly).map((l) => l.gameId)).size;
  const statsFrom = useBox
    ? `the team's box scores (${boxGames} game${boxGames === 1 ? "" : "s"})`
    : undefined;
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

  const undoLast = () => {
    if (undo) saveLineup(game.id, undo);
    setUndo(null);
  };
  const autoFill = () => {
    // Auto-fill plans whole innings: it would wipe changes made in the middle of innings.
    if (
      splitInnings(lineup.slots).size > 0 &&
      !window.confirm("Auto-fill makes a new lineup and drops the mid-inning changes. Go ahead?")
    ) {
      return;
    }
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
  const perms = permissionsFor(data.me.role);
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
  const arrival = arriveBy(game, data.team.gameDay ? data.team.gameDay.arriveMinutes : 60);

  // The game's day has passed (local date): time to mark it final.
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const played = !isFinal && game.date < todayIso;
  const showArrival = !isFinal && !!arrival;
  const hasPlace = !!placeLabel(game);
  const showUniform = perms.editTeam || !!gameUniformShown(game.uniform, data.uniforms);
  // Parts of the Game day card: a line between them (beside each other on wide screens).
  const infoPart =
    "border-slate-100 [&:not(:first-child)]:border-t-2 [&:not(:first-child)]:pt-3 md:[&:not(:first-child)]:border-t-0 md:[&:not(:first-child)]:border-l-2 md:[&:not(:first-child)]:pt-0 md:[&:not(:first-child)]:pl-5";

  // Parents: uniform, where to go and their kid's box score; no lineup.
  if (data.me.role === "parent") return <ParentGame data={data} game={game} arrival={arrival} />;

  return (
    <AppShell
      title={`vs ${game.opponent}`}
      subtitle={`${formatGameDate(game)} · ${game.innings} inn`}
      backHref="/games"
      tab="games"
      pane={<GamesPane currentId={game.id} />}
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
        played && (
          // The game's over but not marked final yet: ask right at the top.
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-slate-700 bg-white p-3">
            <p className="min-w-0 flex-1 text-base font-semibold">
              Game over? Mark it final so it counts toward playing time.
            </p>
            <button
              onClick={markFinal}
              className="h-11 shrink-0 rounded-lg bg-slate-800 px-4 text-base font-bold text-white active:bg-slate-900"
            >
              Mark final
            </button>
          </div>
        )
      )}

      <TournamentTag gameId={game.id} />

      {/* Game day: when to be there, where, and what to wear, in one card. */}
      {(showArrival || hasPlace || showUniform) && (
        <section className="mb-4 flex flex-col gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 md:flex-row md:gap-5">
          {showArrival && (
            <div className={infoPart}>
              <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">
                Arrive by
              </h2>
              <p className="text-2xl font-black whitespace-nowrap">{arrival}</p>
            </div>
          )}
          {hasPlace && (
            <div className={`${infoPart} md:flex-1`}>
              <GamePlaceCard game={game} compact />
            </div>
          )}
          {showUniform && (
            <div className={`${infoPart} md:flex-1`}>
              <GameUniformCard
                game={game}
                combos={data.uniforms}
                canEdit={perms.editTeam}
                compact
              />
            </div>
          )}
        </section>
      )}

      {!isFinal && <WeatherCard place={game} date={game.date} time={game.startTime} />}

      {/* After the game: the box score and pitch counts (coaches and managers). */}
      {seesStats && (isFinal || game.date <= todayIso) && (
        <GameBoxScore game={game} players={data.players} lineup={lineup} box={box} />
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
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
              {/* How auto-fill builds it: a small switch, not two big cards. */}
              <div
                role="radiogroup"
                aria-label="How auto-fill builds the lineup"
                className="grid shrink-0 grid-cols-2 rounded-xl border-2 border-slate-300 bg-white p-1 md:w-72"
              >
                {(["fair", "competitive"] as const).map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={style === s}
                    disabled={
                      s === "competitive" && (!hasStats || !paid) && style !== "competitive"
                    }
                    title={
                      s === "fair"
                        ? "Everyone plays evenly"
                        : "From GameChanger stats or box scores"
                    }
                    onClick={() => setLineupStyle(game.id, s)}
                    className={`h-10 rounded-lg text-base font-bold disabled:opacity-40 ${
                      style === s ? "bg-[var(--team)] text-white" : "text-slate-800"
                    }`}
                  >
                    {s === "fair" ? "Fair play" : paid ? "Competitive" : "🔒 Competitive"}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 gap-2">
                <button
                  onClick={autoFill}
                  disabled={style === "competitive" && !plan}
                  className="h-12 flex-1 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
                >
                  {lineup.slots.length ? "Auto-fill again" : "Auto-fill"}
                </button>
                <button
                  onClick={() => {
                    undoLast();
                  }}
                  disabled={!undo}
                  className="h-12 w-20 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  onClick={() => change({ ...lineup, slots: [] })}
                  disabled={lineup.slots.length === 0}
                  className="h-12 w-20 rounded-xl border-2 border-slate-400 bg-white text-base font-bold disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {!lineupLocked && !hasStats && !stats.loading && style === "fair" && (
            <p className="-mt-1 mb-3 text-sm text-slate-600">
              {seesStats ? (
                <>
                  Competitive lineups need{" "}
                  <Link href="/stats" className="font-semibold underline">
                    GameChanger stats
                  </Link>{" "}
                  imported, or box scores added on past games.
                </>
              ) : (
                "Competitive lineups use GameChanger stats, which coaches and managers import."
              )}
            </p>
          )}

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

          {/* Keyboards: A auto-fills, U undoes. */}
          <Shortcut
            keyName="a"
            run={autoFill}
            enabled={!lineupLocked && !(style === "competitive" && !plan)}
          />
          <Shortcut keyName="u" run={undoLast} enabled={!lineupLocked && !!undo} />
          {/* Very wide screens: fair-play notes and "Why this lineup?" beside the grid. */}
          <div className="min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_340px] min-[1400px]:items-start min-[1400px]:gap-6">
            <div className="min-w-0">
              <LineupGrid
                lineup={lineup}
                players={players}
                positions={config.fieldPositions}
                violations={shown}
                onCellTap={
                  lineupLocked ? undefined : (playerId, inning) => setCell({ playerId, inning })
                }
                onInningTap={lineupLocked ? undefined : (inning) => setMidInning({ inning })}
                onSwap={
                  lineupLocked
                    ? undefined
                    : (inning, a, b) => {
                        const before = lineup;
                        change(swapInInning(lineup, inning, a, b));
                        toast(
                          `Swapped ${players.get(a)?.name ?? "?"} and ${players.get(b)?.name ?? "?"} in inning ${inning}`,
                          {
                            label: "Undo",
                            run: () => {
                              saveLineup(game.id, before);
                              setUndo(null);
                            },
                          },
                        );
                      }
                }
              />
              {!lineupLocked && (
                <>
                  <button
                    onClick={() => setMidInning({ inning: 0 })}
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--team)] bg-white text-base font-bold text-[var(--team)] active:bg-slate-50 sm:w-auto sm:px-5"
                  >
                    ⇄ Mid-inning change
                  </button>
                  <p className="mt-2 text-sm text-slate-500 lg:hidden">
                    Tap a square to set a position. For a pitching change or sub during an inning,
                    tap the inning number or Mid-inning change.
                  </p>
                  <p className="mt-2 hidden text-sm text-slate-500 lg:block">
                    Click a square to pick a position, or drag it onto another player in the same
                    inning to swap them (on a touch screen, press and hold first). For a pitching
                    change or sub during an inning, click the inning number.
                  </p>
                </>
              )}
            </div>

            <div className="mt-4 min-[1400px]:sticky min-[1400px]:top-20 min-[1400px]:mt-0 min-[1400px]:max-h-[calc(100dvh-6rem)] min-[1400px]:overflow-y-auto">
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
                            statsFrom,
                          )
                        : explainLineup(data.players, lineup, config, history, violations)
                    }
                  />
                </>
              )}
            </div>
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
          marks={
            plan
              ? new Map(
                  [...plan.form].map(([id, f]) => [
                    id,
                    f.trend === "hot"
                      ? { icon: "🔥", label: "Hot lately" }
                      : { icon: "🧊", label: "Cold lately" },
                  ]),
                )
              : undefined
          }
        />
      )}

      {perms.editTeam && !isFinal && lineup.battingOrder.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Share the batting order
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setSharing(true)}
              className="h-12 rounded-xl border-2 border-[var(--team)] bg-white text-base font-bold text-[var(--team)] active:bg-slate-100"
            >
              Picture
            </button>
            {data.groupme && (
              <button
                onClick={() => setPosting(true)}
                className="h-12 rounded-xl bg-[#00aff0] text-base font-bold text-white active:bg-[#0096cc]"
              >
                Post to GroupMe
              </button>
            )}
          </div>
        </section>
      )}

      {perms.editTeam && !isFinal && (
        <div className="mt-6 grid grid-cols-2 gap-2 border-t-2 border-slate-200 pt-4 sm:flex sm:justify-end">
          <button
            onClick={() => setEditing(true)}
            className="h-12 rounded-xl border-2 border-slate-400 bg-white px-6 text-base font-bold active:bg-slate-100"
          >
            Edit game
          </button>
          <button
            onClick={markFinal}
            className="h-12 rounded-xl border-2 border-slate-700 bg-white px-6 text-base font-bold active:bg-slate-100"
          >
            Mark final
          </button>
        </div>
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
        {cell && picked && (
          <button
            onClick={() => {
              setMidInning({ inning: cell.inning, playerId: cell.playerId });
              setCell(null);
            }}
            className="mt-3 h-12 w-full rounded-xl border-2 border-slate-300 bg-white text-base font-bold"
          >
            ⇄ Change in the middle of the inning…
          </button>
        )}
      </Sheet>

      <Sheet
        open={midInning !== null}
        title={
          midInning
            ? midInning.inning
              ? `Inning ${midInning.inning}: change mid-inning`
              : "Mid-inning change: which inning?"
            : ""
        }
        onClose={() => setMidInning(null)}
      >
        {midInning && midInning.inning === 0 && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: lineup.innings }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setMidInning({ inning: n })}
                className="flex h-14 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-lg font-bold active:bg-slate-100"
              >
                Inning {n}
              </button>
            ))}
          </div>
        )}
        {midInning && midInning.inning > 0 && (
          <MidInningSheet
            key={`${midInning.inning}:${midInning.playerId ?? ""}`}
            lineup={lineup}
            inning={midInning.inning}
            players={players}
            positions={config.fieldPositions}
            startPlayerId={midInning.playerId}
            onSave={(next, note) => {
              change(next);
              setMidInning(null);
              toast(note);
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
              location: placeLabel(game),
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
            arriveMinutes={data.team.gameDay?.arriveMinutes ?? null}
            recentPlaces={recentPlaces(data.games)}
            onCancel={() => setEditing(false)}
            onSave={(g) => {
              saveGame(g);
              setUndo(null);
              setEditing(false);
            }}
          />
        )}
        {editing && (
          <GameDeleteSection
            game={game}
            lineup={data.lineups[game.id]}
            onClose={() => setEditing(false)}
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
