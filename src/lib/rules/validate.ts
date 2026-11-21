import { isRuleOn } from "./config";
import { checkCustomRules } from "./custom";
import { formatInnings, inningMoments, outsOf, primaryPosition, slotInnings } from "./outs";
import { balanceOutliers, computeParticipation, emptyParticipation } from "./participation";
import type {
  Lineup,
  LineupSlot,
  Player,
  Position,
  RuleConfig,
  RuleId,
  SeasonHistory,
  Violation,
} from "./types";

/** Thirds of an inning don't add up exactly in floating point. */
const EPS = 1e-9;

type Emit = (
  rule: Exclude<RuleId, "season-balance">,
  v: Omit<Violation, "rule" | "severity">,
) => void;

interface Context {
  players: Player[];
  /** The team's previous game (for rules across games), if there is one. */
  previous: Lineup | null;
  byId: Map<string, Player>;
  /** Name of a player marked absent for this game, else null. */
  absentName: (id: string) => string | null;
  lineup: Lineup;
  config: RuleConfig;
  /** Valid slots only, indexed [inning][playerId] → positions. */
  grid: Map<number, Map<string, Position[]>>;
  /** Valid slots only, by inning (an inning split by outs has several per player). */
  byInning: Map<number, LineupSlot[]>;
  emit: Emit;
}

/**
 * Check a lineup against the season's fair-play rules. Pure: no I/O.
 * `roster` is the team's players; inactive players are ignored.
 */
export function validateLineup(
  roster: Player[],
  lineup: Lineup,
  config: RuleConfig,
  seasonHistory: SeasonHistory,
  previous: Lineup | null = null,
): Violation[] {
  const violations: Violation[] = [];
  // Rules a coach turned off (or that don't apply to coach's pitch) report nothing.
  const emit: Emit = (rule, v) => {
    if (!isRuleOn(config, rule)) return;
    violations.push({ rule, severity: config.severity[rule] === "warn" ? "warn" : "block", ...v });
  };

  const absent = new Set(lineup.absent ?? []);
  const players = roster.filter((p) => p.active !== false && !absent.has(p.id));
  const byId = new Map(players.map((p) => [p.id, p]));
  const absentName = (id: string) =>
    absent.has(id) ? (roster.find((p) => p.id === id)?.name ?? id) : null;
  const allowed = new Set<Position>([...config.fieldPositions, "BENCH"]);

  const grid = new Map<number, Map<string, Position[]>>();
  const byInning = new Map<number, LineupSlot[]>();
  for (let inning = 1; inning <= lineup.innings; inning++) {
    grid.set(inning, new Map());
    byInning.set(inning, []);
  }

  for (const slot of lineup.slots) {
    const away = absentName(slot.playerId);
    const problem = away
      ? `${away} is marked absent for this game.`
      : slotProblem(slot, byId, lineup.innings, allowed);
    if (problem) {
      emit("invalid-slot", { playerId: slot.playerId, inning: slot.inning, message: problem });
      continue;
    }
    const row = grid.get(slot.inning)!;
    row.set(slot.playerId, [...(row.get(slot.playerId) ?? []), slot.position]);
    byInning.get(slot.inning)!.push(slot);
  }

  const ctx: Context = { players, previous, byId, absentName, lineup, config, grid, byInning, emit };
  checkPositionCoverage(ctx);
  checkPlayerAssignment(ctx);
  checkBattingOrder(ctx);
  checkConsecutiveBench(ctx);
  checkBenchRotation(ctx);
  checkPerGameCounts(ctx);
  checkPitcherRest(ctx);
  violations.push(...checkCustomRules(players, lineup, config, previous));
  if (isRuleOn(config, "season-balance")) {
    violations.push(...checkSeasonBalance(players, lineup, config, seasonHistory));
  }
  return violations;
}

function slotProblem(
  slot: LineupSlot,
  byId: Map<string, Player>,
  innings: number,
  allowed: Set<Position>,
): string | null {
  if (!byId.has(slot.playerId)) return `Player ${slot.playerId} isn't on the active roster.`;
  if (!Number.isInteger(slot.inning) || slot.inning < 1 || slot.inning > innings) {
    return `Inning ${slot.inning} is outside this ${innings}-inning game.`;
  }
  if (!allowed.has(slot.position))
    return `${slot.position} isn't a position in this season's rules.`;
  const { from, to } = outsOf(slot);
  if (!(from >= 0 && to <= 3 && from < to)) {
    return `A change in inning ${slot.inning} has outs that don't add up.`;
  }
  return null;
}

function name(ctx: Context, playerId: string): string {
  return ctx.byId.get(playerId)?.name ?? playerId;
}

/**
 * A player's spot for the inning as a whole (their main spot when the inning was split; the
 * bench when they sat 2 or more outs of it).
 */
function positionAt(ctx: Context, inning: number, playerId: string): Position | undefined {
  return primaryPosition((ctx.byInning.get(inning) ?? []).filter((s) => s.playerId === playerId));
}

/** " (outs 1–3)" for part of a split inning; nothing for the whole inning. */
const outsText = (x: number) => (Number.isInteger(x) ? String(x) : `${Math.floor(x) || ""}½`);
const outsNote = (from: number, to: number) =>
  from === 0 && to === 3 ? "" : ` (outs ${outsText(from)}–${outsText(to)})`;

// Every spot is checked at every moment of every inning: a mid-inning change still needs each
// position filled exactly once, all the time.
function checkPositionCoverage(ctx: Context): void {
  for (const [inning, slots] of ctx.byInning) {
    const said = new Set<string>();
    for (const moment of inningMoments(slots)) {
      for (const position of ctx.config.fieldPositions) {
        const holders = [...moment.at].filter(([, ps]) => ps.includes(position)).map(([id]) => id);
        const key = `${position}:${holders.length === 0 ? "none" : holders.length > 1 ? "many" : "ok"}`;
        if (holders.length === 1 || said.has(key)) continue;
        said.add(key);
        const when = outsNote(moment.from, moment.to);
        ctx.emit("position-coverage", {
          inning,
          message:
            holders.length === 0
              ? `Nobody is playing ${position} in inning ${inning}${when}.`
              : `${holders.map((id) => name(ctx, id)).join(" and ")} are both at ${position} in inning ${inning}${when}.`,
        });
      }
    }
  }
}

function checkPlayerAssignment(ctx: Context): void {
  for (const [inning, slots] of ctx.byInning) {
    const moments = inningMoments(slots);
    for (const player of ctx.players) {
      for (const moment of moments) {
        const positions = moment.at.get(player.id) ?? [];
        if (positions.length === 1) continue;
        const when = outsNote(moment.from, moment.to);
        ctx.emit("player-assignment", {
          playerId: player.id,
          inning,
          message:
            positions.length === 0
              ? `${player.name} has no position or bench spot in inning ${inning}${when}.`
              : `${player.name} is in ${positions.join(" and ")} at once in inning ${inning}${when}.`,
        });
        break; // One problem per player per inning is enough to fix it.
      }
    }
  }
}

function checkBattingOrder(ctx: Context): void {
  const seen = new Set<string>();
  for (const id of ctx.lineup.battingOrder) {
    const away = ctx.absentName(id);
    if (away) {
      ctx.emit("batting-order", {
        playerId: id,
        message: `${away} is marked absent but in the batting order.`,
      });
    } else if (!ctx.byId.has(id)) {
      ctx.emit("batting-order", {
        playerId: id,
        message: `Batter ${id} isn't on the active roster.`,
      });
    } else if (seen.has(id)) {
      ctx.emit("batting-order", { playerId: id, message: `${name(ctx, id)} bats more than once.` });
    }
    seen.add(id);
  }
  const notBatting = new Set(ctx.lineup.notBatting ?? []);
  for (const id of notBatting) {
    if (!ctx.byId.has(id)) {
      ctx.emit("batting-order", { playerId: id, message: `${id} isn't on the active roster.` });
    } else if (seen.has(id)) {
      ctx.emit("batting-order", {
        playerId: id,
        message: `${name(ctx, id)} is both batting and sitting out of the batting order.`,
      });
    }
  }
  for (const player of ctx.players) {
    if (!seen.has(player.id) && !notBatting.has(player.id)) {
      ctx.emit("batting-order", {
        playerId: player.id,
        message: `${player.name} is missing from the batting order.`,
      });
    }
  }
}

function checkConsecutiveBench(ctx: Context): void {
  const max = ctx.config.maxConsecutiveBench;
  if (max === null) return;
  for (const player of ctx.players) {
    let run = 0;
    for (let inning = 1; inning <= ctx.lineup.innings; inning++) {
      run = positionAt(ctx, inning, player.id) === "BENCH" ? run + 1 : 0;
      // One violation per run, at the inning where it first goes over.
      if (run === max + 1) {
        ctx.emit("max-consecutive-bench", {
          playerId: player.id,
          inning,
          message: `${player.name} sits ${run} innings in a row (max ${max}).`,
        });
      }
    }
  }
}

function checkBenchRotation(ctx: Context): void {
  if (!ctx.config.benchRotation) return;
  const sits = new Map(ctx.players.map((p) => [p.id, 0]));
  for (let inning = 1; inning <= ctx.lineup.innings; inning++) {
    const benched = ctx.players.filter((p) => positionAt(ctx, inning, p.id) === "BENCH");
    for (const p of benched) sits.set(p.id, sits.get(p.id)! + 1);
    const notYet = ctx.players.filter((p) => sits.get(p.id) === 0);
    if (notYet.length === 0) continue;
    for (const p of benched) {
      if (sits.get(p.id) === 2) {
        ctx.emit("bench-rotation", {
          playerId: p.id,
          inning,
          message: `${p.name} sits a second time before ${notYet.map((q) => q.name).join(", ")} sat once.`,
        });
      }
    }
  }
}

function checkPerGameCounts(ctx: Context): void {
  const { config } = ctx;
  const infield = new Set<Position>(config.infieldPositions);
  const outfield = new Set<Position>(
    config.outfieldPositions.filter((p) => config.fieldPositions.includes(p)),
  );
  const innings = ctx.lineup.innings;
  const mustPlay = Math.ceil((innings * config.minInningsPlayedPercent) / 100);
  for (const player of ctx.players) {
    // Innings at each spot, in thirds when an inning was split by outs.
    const counts = new Map<Position, number>();
    let infieldInnings = 0;
    let outfieldInnings = 0;
    for (let inning = 1; inning <= innings; inning++) {
      for (const slot of ctx.byInning.get(inning) ?? []) {
        if (slot.playerId !== player.id) continue;
        const position = slot.position;
        const w = slotInnings(slot);
        counts.set(position, (counts.get(position) ?? 0) + w);
        if (infield.has(position)) infieldInnings += w;
        if (outfield.has(position)) outfieldInnings += w;
        if (position === "P" && !player.canPitch) {
          ctx.emit("pitcher-eligibility", {
            playerId: player.id,
            inning,
            message: `${player.name} isn't marked as able to pitch.`,
          });
        }
        if (position === "C" && !player.canCatch) {
          ctx.emit("catcher-eligibility", {
            playerId: player.id,
            inning,
            message: `${player.name} isn't marked as able to catch.`,
          });
        }
      }
    }

    const n = (x: number) => `${formatInnings(x)} inning${Math.abs(x - 1) < EPS ? "" : "s"}`;
    if (infieldInnings < config.minInfieldInnings - EPS) {
      ctx.emit("min-infield", {
        playerId: player.id,
        message: `${player.name} plays ${n(infieldInnings).replace(" inning", " infield inning")} (min ${config.minInfieldInnings}).`,
      });
    }
    if (outfield.size > 0 && outfieldInnings < config.minOutfieldInnings - EPS) {
      ctx.emit("min-outfield", {
        playerId: player.id,
        message: `${player.name} plays ${n(outfieldInnings).replace(" inning", " outfield inning")} (min ${config.minOutfieldInnings}).`,
      });
    }
    const played = innings - (counts.get("BENCH") ?? 0);
    if (played < mustPlay - EPS) {
      ctx.emit("min-innings-played", {
        playerId: player.id,
        message: `${player.name} plays ${formatInnings(played)} of ${innings} innings (at least ${mustPlay}).`,
      });
    }

    const maxSame = config.maxInningsSamePosition;
    if (maxSame !== null) {
      for (const [position, count] of counts) {
        if (position !== "BENCH" && count > maxSame + EPS) {
          ctx.emit("max-same-position", {
            playerId: player.id,
            message: `${player.name} plays ${position} for ${formatInnings(count)} innings (max ${maxSame}).`,
          });
        }
      }
    }

    const pitched = counts.get("P") ?? 0;
    if (config.maxInningsPitched !== null && pitched > config.maxInningsPitched + EPS) {
      ctx.emit("max-innings-pitched", {
        playerId: player.id,
        message: `${player.name} pitches ${formatInnings(pitched)} innings (max ${config.maxInningsPitched}).`,
      });
    }
    if (config.catcherCannotPitch && pitched > 0 && (counts.get("C") ?? 0) > 0) {
      ctx.emit("catcher-cannot-pitch", {
        playerId: player.id,
        message: `${player.name} both catches and pitches in this game.`,
      });
    }
  }
}

/** Pitchers who threw a lot last game rest from pitching this game. */
function checkPitcherRest(ctx: Context): void {
  const { previous, config } = ctx;
  if (!previous) return;
  const lastGame = new Map<string, number>();
  for (const s of previous.slots) {
    if (s.position === "P" && s.inning <= previous.innings) {
      lastGame.set(s.playerId, (lastGame.get(s.playerId) ?? 0) + slotInnings(s));
    }
  }
  for (const player of ctx.players) {
    const threw = lastGame.get(player.id) ?? 0;
    if (threw < config.pitcherRestInnings - EPS) continue;
    const inning = [...ctx.grid].find(([, row]) => row.get(player.id)?.includes("P"))?.[0];
    if (inning !== undefined) {
      ctx.emit("pitcher-rest", {
        playerId: player.id,
        inning,
        message: `${player.name} pitched ${formatInnings(threw)} innings last game and should rest from pitching.`,
      });
    }
  }
}

function checkSeasonBalance(
  players: Player[],
  lineup: Lineup,
  config: RuleConfig,
  history: SeasonHistory,
): Violation[] {
  const threshold = config.seasonBalanceThreshold;
  if (threshold === null || players.length === 0) return [];
  const totals = computeParticipation([...history, lineup], config.infieldPositions);
  const stats = players.map((p) => ({
    player: p,
    id: p.id,
    ...(totals[p.id] ?? emptyParticipation()),
  }));
  const { expectedInfield, expectedBench, lowInfield, highBench } = balanceOutliers(
    stats,
    threshold,
  );
  const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;

  const out: Violation[] = [];
  for (const s of stats) {
    if (lowInfield.has(s.id)) {
      out.push({
        rule: "season-balance",
        severity: "warn",
        playerId: s.id,
        message: `${s.player.name} has ${formatInnings(s.infield)} infield innings in ${games(s.games)} (team pace: ${expectedInfield.get(s.id)!.toFixed(1)}).`,
      });
    }
    if (highBench.has(s.id)) {
      out.push({
        rule: "season-balance",
        severity: "warn",
        playerId: s.id,
        message: `${s.player.name} has ${formatInnings(s.bench)} bench innings in ${games(s.games)} (team pace: ${expectedBench.get(s.id)!.toFixed(1)}).`,
      });
    }
  }
  return out;
}
