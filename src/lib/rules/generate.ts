import { solveAssignment } from "./assignment";
import { computeParticipation, emptyParticipation } from "./participation";
import { createRng, shuffle } from "./random";
import type {
  FieldPosition,
  Lineup,
  LineupSlot,
  Player,
  Position,
  RuleConfig,
  SeasonHistory,
  Violation,
} from "./types";
import { validateLineup } from "./validate";

export interface GenerateOptions {
  innings: number;
  /** Candidate lineups to try; the best one wins. */
  attempts?: number;
}

export interface GeneratedLineup {
  lineup: Lineup;
  violations: Violation[];
}

/**
 * Propose a full lineup: no `block` violations when the roster allows it, as few `warn`s
 * as possible, and balanced against season history. Same inputs + seed → same lineup.
 */
export function generateLineup(
  roster: Player[],
  config: RuleConfig,
  seasonHistory: SeasonHistory,
  seed: number,
  { innings, attempts = 60 }: GenerateOptions,
): GeneratedLineup {
  const players = roster.filter((p) => p.active !== false);
  const balance = seasonBalance(players, seasonHistory, config);
  const rng = createRng(seed);

  let best: { result: GeneratedLineup; score: number[] } | null = null;
  for (let i = 0; i < attempts; i++) {
    const lineup = buildLineup(players, config, balance, innings, rng);
    const violations = validateLineup(roster, lineup, config, seasonHistory);
    const score = [
      violations.filter((v) => v.severity === "block").length,
      violations.length,
      preferenceMisses(players, lineup),
    ];
    if (!best || isBetter(score, best.score)) best = { result: { lineup, violations }, score };
  }
  return best!.result;
}

function isBetter(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

function preferenceMisses(players: Player[], lineup: Lineup): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  return lineup.slots.filter((s) => {
    const prefs = byId.get(s.playerId)?.preferredPositions ?? [];
    return s.position !== "BENCH" && prefs.length > 0 && !prefs.includes(s.position);
  }).length;
}

interface Balance {
  /** How far below the team's season infield rate (0–1). Positive = owed infield. */
  infieldDeficit: Map<string, number>;
  /** How far above the team's season bench rate (0–1). Positive = has sat too much. */
  benchSurplus: Map<string, number>;
}

function seasonBalance(players: Player[], history: SeasonHistory, config: RuleConfig): Balance {
  const totals = computeParticipation(history, config.infieldPositions);
  const rates = players.map((p) => {
    const t = totals[p.id] ?? emptyParticipation();
    const innings = t.field + t.bench;
    return {
      id: p.id,
      infield: innings ? t.infield / innings : null,
      bench: innings ? t.bench / innings : null,
    };
  });
  const known = rates.filter((r) => r.infield !== null);
  const avg = (key: "infield" | "bench") =>
    known.length ? known.reduce((s, r) => s + r[key]!, 0) / known.length : 0;
  const avgInfield = avg("infield");
  const avgBench = avg("bench");
  return {
    infieldDeficit: new Map(
      rates.map((r) => [r.id, r.infield === null ? 0 : avgInfield - r.infield]),
    ),
    benchSurplus: new Map(rates.map((r) => [r.id, r.bench === null ? 0 : r.bench - avgBench])),
  };
}

/** Innings per pitcher/catcher stint, given how many players can take a turn. */
function stintLength(
  innings: number,
  available: number,
  softMax: number | null,
  hardMax: number | null,
): number {
  const needed = Math.ceil(innings / Math.max(available, 1));
  let stint = Math.max(softMax ?? innings, needed);
  // Respect the hard limit when the roster can cover the game within it.
  if (hardMax !== null && hardMax * available >= innings) stint = Math.min(stint, hardMax);
  return Math.max(stint, 1);
}

/** Assign consecutive stints from `order`, cycling if the roster runs short. */
function planStints(order: Player[], innings: number, stint: number): (string | undefined)[] {
  const plan: (string | undefined)[] = [];
  for (let i = 0; i < innings; i++) {
    plan.push(order.length ? order[Math.floor(i / stint) % order.length]!.id : undefined);
  }
  return plan;
}

function buildLineup(
  players: Player[],
  config: RuleConfig,
  balance: Balance,
  innings: number,
  rng: () => number,
): Lineup {
  const positions = config.fieldPositions;
  const maxSame = config.maxInningsSamePosition;
  const prefers = (p: Player, pos: FieldPosition) => p.preferredPositions.includes(pos);
  const byPreference = (list: Player[], pos: FieldPosition) =>
    shuffle(list, rng).sort((a, b) => Number(prefers(b, pos)) - Number(prefers(a, pos)));

  // 1. Pitchers and catchers, in consecutive stints.
  const canCatch = players.filter((p) => p.canCatch);
  const catchersWanted = Math.min(canCatch.length, Math.ceil(innings / (maxSame ?? innings)));
  const pitchOnly = byPreference(
    players.filter((p) => p.canPitch && !p.canCatch),
    "P",
  );
  const dual = byPreference(
    players.filter((p) => p.canPitch && p.canCatch),
    "C",
  );
  const reserved = new Set<string>();
  if (config.catcherCannotPitch) {
    // Keep enough catchers out of the pitching rotation, but never so many that
    // the remaining pitchers can't cover the game.
    let need = catchersWanted - canCatch.filter((p) => !p.canPitch).length;
    for (const p of dual) {
      if (need <= 0) break;
      const pitchersLeft = pitchOnly.length + dual.length - reserved.size - 1;
      const mandatory = reserved.size === 0 && canCatch.every((c) => c.canPitch);
      if (mandatory || pitchersLeft * (config.maxInningsPitched ?? innings) >= innings) {
        reserved.add(p.id);
        need--;
      }
    }
  }
  let pitchers = [...pitchOnly, ...dual.filter((p) => !reserved.has(p.id))];
  if (pitchers.length === 0) pitchers = shuffle(players, rng);
  const pitchStint = stintLength(innings, pitchers.length, maxSame, config.maxInningsPitched);
  pitchers = pitchers.slice(0, Math.ceil(innings / pitchStint));
  const pitchPlan = positions.includes("P") ? planStints(pitchers, innings, pitchStint) : [];

  const pitcherIds = new Set(pitchers.map((p) => p.id));
  let catchers = byPreference(
    canCatch.filter((p) => !pitcherIds.has(p.id)),
    "C",
  );
  if (catchers.length === 0)
    catchers = shuffle(
      players.filter((p) => !pitcherIds.has(p.id)),
      rng,
    );
  const catchStint = stintLength(innings, catchers.length, maxSame, null);
  const catchPlan = positions.includes("C") ? planStints(catchers, innings, catchStint) : [];

  // 2. Bench and field, inning by inning.
  const infield = new Set<Position>(config.infieldPositions);
  const benchPerInning = Math.max(0, players.length - positions.length);
  const counts = new Map(players.map((p) => [p.id, new Map<Position, number>()]));
  const benchRun = new Map(players.map((p) => [p.id, 0]));
  const count = (id: string, pos: Position) => counts.get(id)!.get(pos) ?? 0;
  const infieldCount = (id: string) =>
    [...counts.get(id)!].reduce((s, [pos, n]) => s + (infield.has(pos) ? n : 0), 0);
  const slots: LineupSlot[] = [];

  for (let inning = 1; inning <= innings; inning++) {
    const fixed = new Map<string, FieldPosition>();
    const pitcher = pitchPlan[inning - 1];
    const catcher = catchPlan[inning - 1];
    if (pitcher) fixed.set(pitcher, "P");
    if (catcher && catcher !== pitcher) fixed.set(catcher, "C");
    const fixedLater = new Set([...pitchPlan.slice(inning), ...catchPlan.slice(inning)]);

    const free = players.filter((p) => !fixed.has(p.id));
    const benchKey = (p: Player) =>
      count(p.id, "BENCH") * 100 +
      (fixedLater.has(p.id) ? -2 : 0) +
      balance.benchSurplus.get(p.id)! * 10 +
      rng();
    const canSit = (p: Player) =>
      config.maxConsecutiveBench === null || benchRun.get(p.id)! < config.maxConsecutiveBench;
    const sorted = [...free].sort((a, b) => benchKey(a) - benchKey(b));
    const bench = [...sorted.filter(canSit), ...sorted.filter((p) => !canSit(p))].slice(
      0,
      benchPerInning,
    );
    const benchIds = new Set(bench.map((p) => p.id));

    const fielders = free.filter((p) => !benchIds.has(p.id));
    const open = positions.filter((pos) => ![...fixed.values()].includes(pos));
    const cost = fielders.map((p) =>
      open.map((pos) => {
        const n = count(p.id, pos);
        let c = maxSame !== null && n >= maxSame ? 50 : n * 3;
        if (p.preferredPositions.length > 0 && !prefers(p, pos)) c += 2;
        if (infield.has(pos)) {
          if (infieldCount(p.id) < config.minInfieldInnings) c -= 20;
          c -= balance.infieldDeficit.get(p.id)! * 20;
        }
        return c + rng();
      }),
    );
    const assigned = solveAssignment(cost);

    const inningSlots: [string, Position][] = [
      ...fixed,
      ...fielders.map((p, i): [string, Position] => [p.id, open[assigned[i]!]!]),
      ...bench.map((p): [string, Position] => [p.id, "BENCH"]),
    ];
    for (const [playerId, position] of inningSlots) {
      counts.get(playerId)!.set(position, count(playerId, position) + 1);
      benchRun.set(playerId, position === "BENCH" ? benchRun.get(playerId)! + 1 : 0);
      slots.push({ inning, playerId, position });
    }
  }

  const battingOrder = shuffle(players, rng).map((p) => p.id);
  const order = new Map(battingOrder.map((id, i) => [id, i]));
  slots.sort((a, b) => a.inning - b.inning || order.get(a.playerId)! - order.get(b.playerId)!);
  return { innings, battingOrder, slots };
}
