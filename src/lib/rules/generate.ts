import { solveAssignment } from "./assignment";
import { isRuleOn } from "./config";
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
  /** The team's previous game, for rules across games (pitcher rest). */
  previous?: Lineup | null;
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
  { innings, attempts = 60, previous = null }: GenerateOptions,
): GeneratedLineup {
  const { config: limits, players } = buildLimits(
    roster.filter((p) => p.active !== false),
    config,
    innings,
    previous,
  );
  const balance = isRuleOn(config, "season-balance")
    ? seasonBalance(players, seasonHistory, config)
    : {
        infieldDeficit: new Map(players.map((p) => [p.id, 0])),
        benchSurplus: new Map(players.map((p) => [p.id, 0])),
      };
  const rng = createRng(seed);

  let best: { result: GeneratedLineup; score: number[] } | null = null;
  for (let i = 0; i < attempts; i++) {
    const lineup = buildLineup(players, limits, balance, innings, rng);
    const violations = validateLineup(roster, lineup, config, seasonHistory, previous);
    const score = [
      violations.filter((v) => v.severity === "block").length,
      violations.length,
      preferenceMisses(players, lineup),
    ];
    if (!best || isBetter(score, best.score)) best = { result: { lineup, violations }, score };
  }
  return best!.result;
}

interface Limits extends RuleConfig {
  /** Most bench innings any player may have this game (from min-innings-played). */
  maxBenchInnings: number | null;
  /** Players who should rest from pitching this game. */
  resting: Set<string>;
  /** Coach's own rules that are on, ready for auto-fill. */
  aims: {
    atLeast: { positions: Set<Position>; innings: number }[];
    atMost: { positions: Set<Position>; innings: number }[];
    never: Map<string, Set<Position>>;
    /** inning → [player, position] that must be placed. */
    locked: Map<number, [string, FieldPosition][]>;
    /** inning → players who sat that inning last game (and shouldn't sit it again). */
    satLastGame: Map<number, Set<string>>;
  };
}

/**
 * What auto-fill aims for: the coach's rules with anything turned off (or not applying)
 * relaxed, so it doesn't work around a rule nobody asked for.
 */
function buildLimits(
  roster: Player[],
  config: RuleConfig,
  innings: number,
  previous: Lineup | null,
): { config: Limits; players: Player[] } {
  const on = (rule: Parameters<typeof isRuleOn>[1]) => isRuleOn(config, rule);
  // Eligibility turned off means anyone may pitch or catch.
  const players = roster.map((p) => ({
    ...p,
    canPitch: p.canPitch || !on("pitcher-eligibility"),
    canCatch: p.canCatch || !on("catcher-eligibility"),
  }));
  const resting = new Set<string>();
  if (previous && on("pitcher-rest")) {
    const threw = new Map<string, number>();
    for (const s of previous.slots) {
      if (s.position === "P") threw.set(s.playerId, (threw.get(s.playerId) ?? 0) + 1);
    }
    for (const [id, n] of threw) if (n >= config.pitcherRestInnings) resting.add(id);
  }
  const mustPlay = Math.ceil((innings * config.minInningsPlayedPercent) / 100);
  const ids = new Set(players.map((p) => p.id));
  const aims: Limits["aims"] = {
    atLeast: [],
    atMost: [],
    never: new Map(),
    locked: new Map(),
    satLastGame: new Map(),
  };
  for (const rule of config.custom) {
    if (rule.setting === "off") continue;
    if (rule.kind === "position-min") {
      aims.atLeast.push({ positions: new Set(rule.positions), innings: rule.innings });
    } else if (rule.kind === "position-max") {
      aims.atMost.push({ positions: new Set(rule.positions), innings: rule.innings });
    } else if (rule.kind === "never-plays") {
      const set = aims.never.get(rule.playerId) ?? new Set<Position>();
      rule.positions.forEach((p) => set.add(p));
      aims.never.set(rule.playerId, set);
    } else if (
      rule.kind === "locked" &&
      ids.has(rule.playerId) &&
      rule.inning <= innings &&
      config.fieldPositions.includes(rule.position)
    ) {
      aims.locked.set(rule.inning, [
        ...(aims.locked.get(rule.inning) ?? []),
        [rule.playerId, rule.position],
      ]);
    } else if (rule.kind === "no-repeat-bench" && previous) {
      const sat = new Set(
        previous.slots
          .filter((s) => s.inning === rule.inning && s.position === "BENCH")
          .map((s) => s.playerId),
      );
      aims.satLastGame.set(rule.inning, sat);
    }
  }
  // A player who never plays P or C isn't put in the pitching or catching rotation.
  const players2 = players.map((p) => {
    const never = aims.never.get(p.id);
    return never
      ? { ...p, canPitch: p.canPitch && !never.has("P"), canCatch: p.canCatch && !never.has("C") }
      : p;
  });
  return {
    players: players2,
    config: {
      ...config,
      maxConsecutiveBench: on("max-consecutive-bench") ? config.maxConsecutiveBench : null,
      minInfieldInnings: on("min-infield") ? config.minInfieldInnings : 0,
      minOutfieldInnings: on("min-outfield") ? config.minOutfieldInnings : 0,
      maxInningsSamePosition: on("max-same-position") ? config.maxInningsSamePosition : null,
      maxInningsPitched: on("max-innings-pitched") ? config.maxInningsPitched : null,
      catcherCannotPitch: on("catcher-cannot-pitch") && config.catcherCannotPitch,
      maxBenchInnings: on("min-innings-played") ? innings - mustPlay : null,
      resting,
      aims,
    },
  };
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
  config: Limits,
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
  // Rested pitchers sit out the rotation, unless nobody else can pitch.
  const rested = (list: Player[]) => {
    const fresh = list.filter((p) => !config.resting.has(p.id));
    return fresh.length > 0 ? fresh : list;
  };
  const pitchOnly = byPreference(rested(players.filter((p) => p.canPitch && !p.canCatch)), "P");
  const dual = byPreference(rested(players.filter((p) => p.canPitch && p.canCatch)), "C");
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
  // Coach's pitch: P is filled like any other fielding spot below.
  const pitchPlan =
    positions.includes("P") && !config.coachPitch ? planStints(pitchers, innings, pitchStint) : [];

  const pitcherIds = new Set(config.coachPitch ? [] : pitchers.map((p) => p.id));
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
  const outfield = new Set<Position>(config.outfieldPositions);
  const benchPerInning = Math.max(0, players.length - positions.length);
  const counts = new Map(players.map((p) => [p.id, new Map<Position, number>()]));
  const benchRun = new Map(players.map((p) => [p.id, 0]));
  const count = (id: string, pos: Position) => counts.get(id)!.get(pos) ?? 0;
  const infieldCount = (id: string) =>
    [...counts.get(id)!].reduce((s, [pos, n]) => s + (infield.has(pos) ? n : 0), 0);
  const outfieldCount = (id: string) =>
    [...counts.get(id)!].reduce((s, [pos, n]) => s + (outfield.has(pos) ? n : 0), 0);
  const groupCount = (id: string, group: Set<Position>) =>
    [...counts.get(id)!].reduce((s, [pos, n]) => s + (group.has(pos) ? n : 0), 0);
  const slots: LineupSlot[] = [];

  for (let inning = 1; inning <= innings; inning++) {
    const fixed = new Map<string, FieldPosition>();
    const pitcher = pitchPlan[inning - 1];
    const catcher = catchPlan[inning - 1];
    if (pitcher) fixed.set(pitcher, "P");
    if (catcher && catcher !== pitcher) fixed.set(catcher, "C");
    // A coach's locked spot wins over the pitching/catching plan for that inning.
    for (const [playerId, position] of config.aims.locked.get(inning) ?? []) {
      for (const [id, pos] of [...fixed]) if (id === playerId || pos === position) fixed.delete(id);
      fixed.set(playerId, position);
    }
    const fixedLater = new Set([...pitchPlan.slice(inning), ...catchPlan.slice(inning)]);

    const free = players.filter((p) => !fixed.has(p.id));
    const satLast = config.aims.satLastGame.get(inning);
    const benchKey = (p: Player) =>
      (satLast?.has(p.id) ? 500 : 0) +
      count(p.id, "BENCH") * 100 +
      (fixedLater.has(p.id) ? -2 : 0) +
      balance.benchSurplus.get(p.id)! * 10 +
      rng();
    const canSit = (p: Player) =>
      (config.maxConsecutiveBench === null || benchRun.get(p.id)! < config.maxConsecutiveBench) &&
      (config.maxBenchInnings === null || count(p.id, "BENCH") < config.maxBenchInnings);
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
        if (outfield.has(pos) && outfieldCount(p.id) < config.minOutfieldInnings) c -= 20;
        // Coach's own rules.
        if (config.aims.never.get(p.id)?.has(pos)) c += 1000;
        for (const aim of config.aims.atLeast) {
          if (aim.positions.has(pos) && groupCount(p.id, aim.positions) < aim.innings) c -= 20;
        }
        for (const aim of config.aims.atMost) {
          if (aim.positions.has(pos) && groupCount(p.id, aim.positions) >= aim.innings) c += 50;
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
