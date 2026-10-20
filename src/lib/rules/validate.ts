import { computeParticipation, emptyParticipation } from "./participation";
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

type Emit = (
  rule: Exclude<RuleId, "season-balance">,
  v: Omit<Violation, "rule" | "severity">,
) => void;

interface Context {
  players: Player[];
  byId: Map<string, Player>;
  lineup: Lineup;
  config: RuleConfig;
  /** Valid slots only, indexed [inning][playerId] → positions. */
  grid: Map<number, Map<string, Position[]>>;
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
): Violation[] {
  const violations: Violation[] = [];
  const emit: Emit = (rule, v) => violations.push({ rule, severity: config.severity[rule], ...v });

  const players = roster.filter((p) => p.active !== false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const allowed = new Set<Position>([...config.fieldPositions, "BENCH"]);

  const grid = new Map<number, Map<string, Position[]>>();
  for (let inning = 1; inning <= lineup.innings; inning++) grid.set(inning, new Map());

  for (const slot of lineup.slots) {
    const problem = slotProblem(slot, byId, lineup.innings, allowed);
    if (problem) {
      emit("invalid-slot", { playerId: slot.playerId, inning: slot.inning, message: problem });
      continue;
    }
    const row = grid.get(slot.inning)!;
    row.set(slot.playerId, [...(row.get(slot.playerId) ?? []), slot.position]);
  }

  const ctx: Context = { players, byId, lineup, config, grid, emit };
  checkPositionCoverage(ctx);
  checkPlayerAssignment(ctx);
  checkBattingOrder(ctx);
  checkConsecutiveBench(ctx);
  checkBenchRotation(ctx);
  checkPerGameCounts(ctx);
  violations.push(...checkSeasonBalance(players, lineup, config, seasonHistory));
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
  return null;
}

function name(ctx: Context, playerId: string): string {
  return ctx.byId.get(playerId)?.name ?? playerId;
}

/** The single position a player holds in an inning, or undefined if missing/ambiguous. */
function positionAt(ctx: Context, inning: number, playerId: string): Position | undefined {
  const positions = ctx.grid.get(inning)?.get(playerId);
  return positions?.length === 1 ? positions[0] : undefined;
}

function checkPositionCoverage(ctx: Context): void {
  for (const [inning, row] of ctx.grid) {
    for (const position of ctx.config.fieldPositions) {
      const holders = [...row].filter(([, ps]) => ps.includes(position)).map(([id]) => id);
      if (holders.length === 0) {
        ctx.emit("position-coverage", {
          inning,
          message: `Nobody is playing ${position} in inning ${inning}.`,
        });
      } else if (holders.length > 1) {
        const who = holders.map((id) => name(ctx, id)).join(" and ");
        ctx.emit("position-coverage", {
          inning,
          message: `${who} are both at ${position} in inning ${inning}.`,
        });
      }
    }
  }
}

function checkPlayerAssignment(ctx: Context): void {
  for (const [inning, row] of ctx.grid) {
    for (const player of ctx.players) {
      const positions = row.get(player.id) ?? [];
      if (positions.length === 0) {
        ctx.emit("player-assignment", {
          playerId: player.id,
          inning,
          message: `${player.name} has no position or bench spot in inning ${inning}.`,
        });
      } else if (positions.length > 1) {
        ctx.emit("player-assignment", {
          playerId: player.id,
          inning,
          message: `${player.name} is in ${positions.join(" and ")} in inning ${inning}.`,
        });
      }
    }
  }
}

function checkBattingOrder(ctx: Context): void {
  const seen = new Set<string>();
  for (const id of ctx.lineup.battingOrder) {
    if (!ctx.byId.has(id)) {
      ctx.emit("batting-order", {
        playerId: id,
        message: `Batter ${id} isn't on the active roster.`,
      });
    } else if (seen.has(id)) {
      ctx.emit("batting-order", { playerId: id, message: `${name(ctx, id)} bats more than once.` });
    }
    seen.add(id);
  }
  for (const player of ctx.players) {
    if (!seen.has(player.id)) {
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
  for (const player of ctx.players) {
    const counts = new Map<Position, number>();
    let infieldInnings = 0;
    for (let inning = 1; inning <= ctx.lineup.innings; inning++) {
      for (const position of ctx.grid.get(inning)?.get(player.id) ?? []) {
        counts.set(position, (counts.get(position) ?? 0) + 1);
        if (infield.has(position)) infieldInnings++;
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

    if (infieldInnings < config.minInfieldInnings) {
      ctx.emit("min-infield", {
        playerId: player.id,
        message: `${player.name} plays ${infieldInnings} infield inning${infieldInnings === 1 ? "" : "s"} (min ${config.minInfieldInnings}).`,
      });
    }

    const maxSame = config.maxInningsSamePosition;
    if (maxSame !== null) {
      for (const [position, n] of counts) {
        if (position !== "BENCH" && n > maxSame) {
          ctx.emit("max-same-position", {
            playerId: player.id,
            message: `${player.name} plays ${position} for ${n} innings (max ${maxSame}).`,
          });
        }
      }
    }

    const pitched = counts.get("P") ?? 0;
    if (config.maxInningsPitched !== null && pitched > config.maxInningsPitched) {
      ctx.emit("max-innings-pitched", {
        playerId: player.id,
        message: `${player.name} pitches ${pitched} innings (max ${config.maxInningsPitched}).`,
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

function checkSeasonBalance(
  players: Player[],
  lineup: Lineup,
  config: RuleConfig,
  history: SeasonHistory,
): Violation[] {
  const threshold = config.seasonBalanceThreshold;
  if (threshold === null || players.length === 0) return [];
  const totals = computeParticipation([...history, lineup], config.infieldPositions);
  const stats = players.map((p) => ({ player: p, ...(totals[p.id] ?? emptyParticipation()) }));
  const avgInfield = stats.reduce((sum, s) => sum + s.infield, 0) / stats.length;
  const avgBench = stats.reduce((sum, s) => sum + s.bench, 0) / stats.length;

  const out: Violation[] = [];
  for (const s of stats) {
    if (s.infield < avgInfield - threshold) {
      out.push({
        rule: "season-balance",
        severity: "warn",
        playerId: s.player.id,
        message: `${s.player.name} has ${s.infield} infield innings this season (team average ${avgInfield.toFixed(1)}).`,
      });
    }
    if (s.bench > avgBench + threshold) {
      out.push({
        rule: "season-balance",
        severity: "warn",
        playerId: s.player.id,
        message: `${s.player.name} has ${s.bench} bench innings this season (team average ${avgBench.toFixed(1)}).`,
      });
    }
  }
  return out;
}
