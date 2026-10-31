import type { FieldPosition, Lineup, Player, RuleConfig } from "./types";

// Competitive lineups: who bats where, who plays where and who sits, from each kid's
// GameChanger season stats. Small samples are pulled toward the team average so one hot
// game doesn't make a kid the cleanup hitter. Pure: no I/O.

/** One player's season numbers, already read from the stats import. */
export interface StatLine {
  pa: number;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Innings pitched as a number (36.1 in box-score notation is 36⅓). */
  ip: number;
  whip: number | null;
  era: number | null;
  /** Fielding: percentage and total chances. */
  fpct: number | null;
  chances: number;
  /** Innings played at each position this season. */
  innings: Partial<Record<FieldPosition, number>>;
}

export type BattingRole = "obp" | "ops" | "slg" | "rest" | "none";

export interface CompetitivePlan {
  lines: Map<string, StatLine>;
  /** Best order for everyone given, players without batting stats last. */
  battingOrder: string[];
  battingRole: Map<string, BattingRole>;
  /** 0–1 per position: how good a fit each player is, from where they've played and how well. */
  fit: Map<string, Record<FieldPosition, number>>;
  /** 0–1: overall strength; the weakest sit first. */
  overall: Map<string, number>;
  /** 0–1: pitching strength (0 for kids with no innings pitched). */
  pitching: Map<string, number>;
  /** Sample-adjusted numbers used for the picks, for explanations. */
  adjusted: Map<
    string,
    { obp: number | null; slg: number | null; ops: number | null; whip: number | null }
  >;
}

/** How much a position matters to winning, for trading one kid's fit against another's. */
export const POSITION_WEIGHT: Record<FieldPosition, number> = {
  P: 1,
  SS: 1,
  C: 0.9,
  "2B": 0.8,
  "3B": 0.8,
  CF: 0.8,
  "1B": 0.7,
  LCF: 0.6,
  RCF: 0.6,
  LF: 0.5,
  RF: 0.4,
};

const FIELD: FieldPosition[] = Object.keys(POSITION_WEIGHT) as FieldPosition[];
/** Plate appearances, innings and chances worth of team average mixed into small samples. */
const PA_PRIOR = 15;
const IP_PRIOR = 6;
const CHANCE_PRIOR = 10;
/** Below these, a kid ranks after everyone with a real sample (too few to trust). */
export const MIN_PA = 10;
export const MIN_IP = 5;
/** A kid with no stats counts as about average overall, but with no history at a spot. */
const UNKNOWN = 0.5;
const UNKNOWN_FIT = 0.3;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const shrink = (x: number, n: number, avg: number, prior: number) =>
  (x * n + avg * prior) / (n + prior);

/**
 * Rank-based 0–1 score (best = 1); ids missing from `values` aren't scored. Ids not in
 * `qualified` (when given) rank after every qualified one.
 */
function rankScore(
  values: Map<string, number>,
  higherIsBetter: boolean,
  qualified?: Set<string>,
): Map<string, number> {
  const q = (id: string) => (qualified && !qualified.has(id) ? 1 : 0);
  const sorted = [...values].sort(
    (a, b) => q(a[0]) - q(b[0]) || (higherIsBetter ? b[1] - a[1] : a[1] - b[1]),
  );
  const n = sorted.length;
  return new Map(sorted.map(([id], i) => [id, n === 1 ? 1 : 1 - i / (n - 1)]));
}

/** Build the plan for today's players from their stat lines (players without one are "unknown"). */
export function competitivePlan(players: Player[], lines: Map<string, StatLine>): CompetitivePlan {
  const ids = players.map((p) => p.id);
  const mine = new Map(ids.flatMap((id) => (lines.has(id) ? [[id, lines.get(id)!]] : [])));
  const batters = [...mine].filter(([, l]) => l.pa > 0);
  const teamAvg = (k: "obp" | "slg" | "ops") =>
    mean(batters.flatMap(([, l]) => (l[k] === null ? [] : [l[k]!]))) ?? 0;
  const avg = { obp: teamAvg("obp"), slg: teamAvg("slg"), ops: teamAvg("ops") };
  const pitchers = [...mine].filter(([, l]) => l.ip > 0 && l.whip !== null);
  const avgWhip = mean(pitchers.map(([, l]) => l.whip!)) ?? 0;

  const adjusted: CompetitivePlan["adjusted"] = new Map();
  for (const id of ids) {
    const l = mine.get(id);
    const bat = (k: "obp" | "slg" | "ops") =>
      l && l.pa > 0 && l[k] !== null ? shrink(l[k]!, l.pa, avg[k], PA_PRIOR) : null;
    adjusted.set(id, {
      obp: bat("obp"),
      slg: bat("slg"),
      ops: bat("ops"),
      whip: l && l.ip > 0 && l.whip !== null ? shrink(l.whip, l.ip, avgWhip, IP_PRIOR) : null,
    });
  }

  // Batting order: on-base at the top, the best bat 3rd, power 4th, then by OPS.
  const remaining = new Set(ids.filter((id) => adjusted.get(id)!.ops !== null));
  const enough = (id: string) => (mine.get(id)?.pa ?? 0) >= MIN_PA;
  const better = (k: "obp" | "slg" | "ops", a: string, b: string) =>
    enough(a) !== enough(b) ? enough(a) : adjusted.get(a)![k]! > adjusted.get(b)![k]!;
  const pick = (k: "obp" | "slg" | "ops") => {
    let best: string | null = null;
    for (const id of remaining) if (best === null || better(k, id, best)) best = id;
    if (best !== null) remaining.delete(best);
    return best;
  };
  const battingOrder: string[] = [];
  const battingRole = new Map<string, BattingRole>();
  for (const role of ["obp", "obp", "ops", "slg"] as const) {
    const id = pick(role);
    if (id === null) break;
    battingOrder.push(id);
    battingRole.set(id, role);
  }
  for (const id of [...remaining].sort((a, b) => (better("ops", a, b) ? -1 : 1))) {
    battingOrder.push(id);
    battingRole.set(id, "rest");
  }
  for (const id of ids) {
    if (!battingRole.has(id)) {
      battingOrder.push(id);
      battingRole.set(id, "none");
    }
  }

  // Pitching: sample-adjusted WHIP, best first.
  const pitchRank = rankScore(
    new Map(
      ids.flatMap((id) => (adjusted.get(id)!.whip === null ? [] : [[id, adjusted.get(id)!.whip!]])),
    ),
    false,
    new Set(ids.filter((id) => (mine.get(id)?.ip ?? 0) >= MIN_IP)),
  );
  const pitching = new Map(ids.map((id) => [id, pitchRank.get(id) ?? 0]));

  // Fielding: share of the team's innings at each spot (who the coaches trust there) and
  // a sample-adjusted fielding percentage.
  const fielders = [...mine].filter(([, l]) => l.chances > 0 && l.fpct !== null);
  const avgFpct = mean(fielders.map(([, l]) => l.fpct!)) ?? 0;
  const defense = rankScore(
    new Map(fielders.map(([id, l]) => [id, shrink(l.fpct!, l.chances, avgFpct, CHANCE_PRIOR)])),
    true,
  );
  const inningsAt = (l: StatLine | undefined, pos: FieldPosition) => {
    if (!l) return 0;
    // 10-fielder spots borrow center field's history.
    if (pos === "LCF" || pos === "RCF") return l.innings[pos] ?? l.innings.CF ?? 0;
    return l.innings[pos] ?? 0;
  };
  const most = Object.fromEntries(
    FIELD.map((pos) => [pos, Math.max(0, ...ids.map((id) => inningsAt(mine.get(id), pos)))]),
  ) as Record<FieldPosition, number>;
  const fit = new Map(
    ids.map((id) => {
      const l = mine.get(id);
      const d = defense.get(id) ?? UNKNOWN;
      const row = Object.fromEntries(
        FIELD.map((pos) => {
          if (pos === "P") return [pos, pitching.get(id)!];
          if (!l) return [pos, UNKNOWN_FIT];
          const share = most[pos] > 0 ? inningsAt(l, pos) / most[pos] : 0;
          return [pos, 0.7 * share + 0.3 * d];
        }),
      ) as Record<FieldPosition, number>;
      return [id, row];
    }),
  );

  const batRank = rankScore(
    new Map(
      ids.flatMap((id) => (adjusted.get(id)!.ops === null ? [] : [[id, adjusted.get(id)!.ops!]])),
    ),
    true,
    new Set(ids.filter(enough)),
  );
  const overall = new Map(
    ids.map((id) => {
      const bestSpot = Math.max(...FIELD.filter((p) => p !== "P").map((p) => fit.get(id)![p]));
      const glove = mine.has(id) ? bestSpot : UNKNOWN;
      return [id, 0.5 * (batRank.get(id) ?? UNKNOWN) + 0.5 * glove];
    }),
  );

  return { lines: mine, battingOrder, battingRole, fit, overall, pitching, adjusted };
}

/** The rules a competitive lineup keeps: Must rules stay, Warn rules are set aside. */
export function mustRulesOnly(config: RuleConfig): RuleConfig {
  const severity = Object.fromEntries(
    Object.entries(config.severity).map(([rule, s]) => [rule, s === "warn" ? "off" : s]),
  ) as RuleConfig["severity"];
  return { ...config, severity, custom: config.custom.filter((r) => r.setting === "block") };
}

/** How strong a lineup's defense and playing time are by the plan (higher is better). */
export function lineupStrength(lineup: Lineup, plan: CompetitivePlan): number {
  let total = 0;
  for (const s of lineup.slots) {
    if (s.position === "BENCH") continue;
    total += POSITION_WEIGHT[s.position] * (plan.fit.get(s.playerId)?.[s.position] ?? 0);
    total += 0.5 * (plan.overall.get(s.playerId) ?? 0);
  }
  return total;
}
