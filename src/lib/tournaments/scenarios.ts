// Tournaments: "What time do we play tomorrow?" Every way the pool games left could go
// (who wins, and by how much when the tie-breakers count runs), boiled down to the seeds we
// can still finish, the bracket game each seed plays first, and what has to happen (pure).
import { teamKey } from "./event";
import { parsePlaceholder } from "./schedule";
import {
  remainingPoolGames,
  sideTeam,
  standings,
  type Pick as WinPick,
  type SGame,
  type StandingRow,
  type StandingsInput,
} from "./standings";

/** Most pool games left that we try every way of (2^10 = 1,024). */
export const MAX_SCENARIO_GAMES = 10;
/** Highest score tried for a game when runs decide a tie. */
const MAX_RUNS = 15;
/** Most standings worked out for run margins before we just say "depends on runs". */
const RUN_BUDGET = 400_000;

export interface WinCond {
  gameId: string;
  winner: WinPick;
}

/** A score condition on one game, for its winner: margin, the loser's runs, or the winner's. */
export interface RunCond {
  gameId: string;
  winner: WinPick;
  kind: "margin" | "loserRuns" | "winnerRuns";
  min: number;
  /** Null: "or more". */
  max: number | null;
}

export interface Term {
  wins: WinCond[];
  runs: RunCond[];
  /** Runs decide it but we couldn't say how (too many games in play). */
  dependsOnRuns: boolean;
  /** When dependsOnRuns: the games whose scores decide it, if we know them. */
  runsGames?: string[];
  /** Two games' scores that count together ("our losing margin plus Dogs' winning margin is
   * 5 or less"): a plus b, or a minus b, between min and max (null: no limit). */
  combo?: Combo;
}

type RunSide = Pick<RunCond, "gameId" | "winner" | "kind">;
export interface Combo {
  a: RunSide;
  b: RunSide;
  op: "sum" | "diff";
  min: number | null;
  max: number | null;
}

export interface Outcome {
  seed: number;
  /** Bigger than seed when it isn't settled: runs we couldn't work out, or a tie the rules
   * don't break. */
  seedTo: number;
  open: StandingRow["open"];
  /** Any one of these (each a set of things that all have to happen). */
  terms: Term[];
}

export interface Scenarios {
  remaining: number;
  /** Too many games left to work out: every seed is still possible. */
  tooMany: boolean;
  outcomes: Outcome[];
}

type Result = { seed: number; seedTo: number; open: StandingRow["open"] };

function ourRow(
  input: StandingsInput,
  ourId: string,
  picks: Map<string, WinPick>,
  games?: SGame[],
) {
  const tables = standings({ ...input, games: games ?? input.games, picks });
  for (const t of tables) {
    const r = t.rows.find((x) => x.teamId === ourId);
    if (r) return { row: r, rows: t.rows };
  }
  return null;
}

/** Every outcome for us, with the conditions behind each. */
export function scenarios(input: StandingsInput, ourId: string): Scenarios {
  const left = remainingPoolGames(input.games, input.teams);
  if (left.length > MAX_SCENARIO_GAMES)
    return { remaining: left.length, tooMany: true, outcomes: [] };
  const budget = { left: RUN_BUDGET };
  const memo: Memo = new Map();
  const byOutcome = new Map<string, { result: Result; terms: Term[] }>();
  const add = (result: Result, term: Term) => {
    const key = `${result.seed}-${result.seedTo}-${result.open ?? ""}`;
    const o = byOutcome.get(key) ?? { result, terms: [] };
    o.terms.push(term);
    byOutcome.set(key, o);
  };

  for (let mask = 0; mask < 1 << left.length; mask++) {
    const picks = new Map<string, WinPick>(
      left.map((g, i) => [g.id, mask & (1 << i) ? "home" : "away"] as const),
    );
    const wins = left.map((g) => ({ gameId: g.id, winner: picks.get(g.id)! }));
    const ours = ourRow(input, ourId, picks);
    if (!ours) return { remaining: left.length, tooMany: false, outcomes: [] };
    const { row, rows } = ours;
    if (row.open !== "runs") {
      add(row, { wins, runs: [], dependsOnRuns: false });
      continue;
    }
    const tied = new Set(rows.filter((r) => r.seed === row.seed).map((r) => r.teamId));
    const split = byRuns(input, ourId, picks, left, tied, budget, memo, row.seed);
    if (!split) {
      // Too many games tangled together: name the games whose scores decide it.
      const games = relevantGames(input, left, tied, ourId).map((g) => g.id);
      add(row, {
        wins,
        runs: [],
        dependsOnRuns: true,
        ...(games.length ? { runsGames: games } : {}),
      });
      continue;
    }
    for (const s of split) {
      const ruled = new Set(s.conds.map((c) => c.gameId));
      add(s.result, {
        wins: wins.filter((w) => !ruled.has(w.gameId)),
        runs: s.conds,
        dependsOnRuns: s.dependsOn.length > 0,
        ...(s.dependsOn.length ? { runsGames: s.dependsOn } : {}),
      });
    }
  }

  const outcomes = [...byOutcome.values()]
    .map(({ result, terms }) => ({ ...result, terms: combine(simplify(terms, left.length)) }))
    .sort((a, b) => a.seed - b.seed || a.seedTo - b.seedTo);
  return { remaining: left.length, tooMany: false, outcomes };
}

type Score = { w: number; l: number };
/** Every final score tried for a game: the winner's runs and the loser's. */
export const SCORES: Score[] = [];
for (let w = 1; w <= MAX_RUNS; w++) for (let l = 0; l < w; l++) SCORES.push({ w, l });

type Kind = RunCond["kind"];
const KINDS: Kind[] = ["margin", "loserRuns", "winnerRuns"];
const valueOf = (kind: Kind, p: Score) =>
  kind === "margin" ? p.w - p.l : kind === "loserRuns" ? p.l : p.w;
type Group = { key: string; conds: RunCond[]; members: number[] };

/**
 * Group some of a game's scores (indexes into SCORES) by one kind of number (the winning
 * margin, the loser's runs or the winner's runs): runs of equal values that lead to the same
 * key become one condition ("by 1 to 3", "by 4 or more"). Null when that number doesn't
 * decide it.
 */
function byKind(
  members: number[],
  keyOf: (i: number) => string,
  kind: Kind,
  gameId: string,
  winner: WinPick,
): { key: string; cond: RunCond; members: number[] }[] | null {
  const byValue = new Map<number, { key: string; members: number[] }>();
  for (const i of members) {
    const v = valueOf(kind, SCORES[i]!);
    const k = keyOf(i);
    const seen = byValue.get(v);
    if (seen && seen.key !== k) return null;
    if (seen) seen.members.push(i);
    else byValue.set(v, { key: k, members: [i] });
  }
  const values = [...byValue.keys()].sort((a, b) => a - b);
  const top = values.at(-1)!;
  const out: { key: string; cond: RunCond; members: number[] }[] = [];
  let start = values[0]!;
  let group: number[] = [];
  for (let n = 0; n < values.length; n++) {
    const v = values[n]!;
    group.push(...byValue.get(v)!.members);
    const next = values[n + 1];
    if (next === undefined || byValue.get(next)!.key !== byValue.get(v)!.key) {
      out.push({
        key: byValue.get(v)!.key,
        // The top of what we tried counts as "or more" (a bigger score goes the same way).
        cond: { gameId, winner, kind, min: start, max: v === top ? null : v },
        members: group,
      });
      group = [];
      if (next !== undefined) start = next;
    }
  }
  return out;
}

/**
 * Split a game's scores into conditions that each lead to one key: by one number (margin,
 * loser's runs or winner's runs), or by two when the rules use both ("we lose with Bats
 * scoring 4 or fewer, by 1 to 2 runs"). Null when no such split exists.
 */
export function splitGame(
  members: number[],
  keyOf: (i: number) => string,
  gameId: string,
  winner: WinPick,
): Group[] | null {
  for (const kind of KINDS) {
    const out = byKind(members, keyOf, kind, gameId, winner);
    if (out)
      return out.map((o) => ({
        key: o.key,
        conds: out.length > 1 ? [o.cond] : [],
        members: o.members,
      }));
  }
  for (const outerKind of KINDS) {
    for (const innerKind of KINDS) {
      if (innerKind === outerKind) continue;
      // Within each value of the outer number, the inner number has to decide it.
      const maps = new Map<number, Map<number, string>>();
      let fits = true;
      for (const i of members) {
        const ov = valueOf(outerKind, SCORES[i]!);
        const iv = valueOf(innerKind, SCORES[i]!);
        const m = maps.get(ov) ?? new Map<number, string>();
        const seen = m.get(iv);
        if (seen !== undefined && seen !== keyOf(i)) {
          fits = false;
          break;
        }
        m.set(iv, keyOf(i));
        maps.set(ov, m);
      }
      if (!fits) continue;
      // Merge neighbouring outer values that agree wherever both have scores. (We only try
      // scores up to MAX_RUNS, so a 5-run win reaches higher loser's runs than a 6-run win;
      // that's no reason to split them.)
      const values = [...maps.keys()].sort((a, b) => a - b);
      const top = values.at(-1)!;
      const outer: { from: number; to: number; seen: Map<number, string>; members: number[] }[] =
        [];
      for (const v of values) {
        const m = maps.get(v)!;
        const last = outer.at(-1);
        const agrees = last && [...m].every(([iv, k]) => (last.seen.get(iv) ?? k) === k);
        if (last && agrees) {
          last.to = v;
          for (const [iv, k] of m) last.seen.set(iv, k);
        } else outer.push({ from: v, to: v, seen: new Map(m), members: [] });
      }
      for (const i of members) {
        const v = valueOf(outerKind, SCORES[i]!);
        outer.find((o) => v >= o.from && v <= o.to)!.members.push(i);
      }
      const out: Group[] = [];
      let ok = true;
      for (const o of outer) {
        const inner = byKind(o.members, keyOf, innerKind, gameId, winner);
        if (!inner) {
          ok = false;
          break;
        }
        const outerCond: RunCond = {
          gameId,
          winner,
          kind: outerKind,
          min: o.from,
          max: o.to === top ? null : o.to,
        };
        for (const n of inner) {
          out.push({
            key: n.key,
            conds: [
              ...(outer.length > 1 ? [outerCond] : []),
              ...(inner.length > 1 ? [n.cond] : []),
            ],
            members: n.members,
          });
        }
      }
      if (ok) return out;
    }
  }
  return null;
}

type Split = { result: Result; conds: RunCond[]; dependsOn: string[] };

/** The games left that involve the tied teams, ours first. */
function relevantGames(
  input: StandingsInput,
  left: SGame[],
  tied: Set<string>,
  ourId: string,
): SGame[] {
  const teamsIn = (g: SGame) => [
    sideTeam(g.home, g.homeTeamId, input.teams),
    sideTeam(g.away, g.awayTeamId, input.teams),
  ];
  return left
    .filter((g) => teamsIn(g).some((t) => t && tied.has(t.id)))
    .sort(
      (a, b) =>
        Number(teamsIn(b).some((t) => t?.id === ourId)) -
        Number(teamsIn(a).some((t) => t?.id === ourId)),
    );
}
/** Ties already worked out, by the tied teams and who wins the games that involve them. The
 * order inside a tie depends only on those teams' games, so it's the same whatever happens
 * elsewhere; seeds are kept relative to the top of the tie. */
type Memo = Map<string, Split[] | null>;

/**
 * A tie that runs settle: try every score of the games left that involve the tied teams (up
 * to two; ours first) and say what each leads to, by the winning margin, the loser's runs or
 * the winner's runs (or two of them). With two games, the second game's score is named only
 * where it matters. Null when more than two games are in play (or it would take too long).
 */
function byRuns(
  input: StandingsInput,
  ourId: string,
  picks: Map<string, WinPick>,
  left: SGame[],
  tied: Set<string>,
  budget: { left: number },
  memo: Memo,
  top: number,
): Split[] | null {
  const relevant = relevantGames(input, left, tied, ourId);
  const memoKey = `${[...tied].sort().join(",")}|${relevant.map((g) => `${g.id}:${picks.get(g.id)}`).join(",")}`;
  const shift = (list: Split[] | null, by: number) =>
    list?.map((x) => ({
      ...x,
      result: { ...x.result, seed: x.result.seed + by, seedTo: x.result.seedTo + by },
    })) ?? null;
  if (memo.has(memoKey)) return shift(memo.get(memoKey)!, top);
  const found = work();
  memo.set(memoKey, shift(found, -top));
  return found;

  function work(): Split[] | null {
    if (relevant.length === 0 || relevant.length > 2) return null;
    const cost = SCORES.length ** relevant.length;
    if (budget.left < cost) return null;
    budget.left -= cost;

    const rest = new Map(picks);
    for (const g of relevant) rest.delete(g.id);
    const results = new Map<string, Result>();
    const keyOf = (r: Result) => `${r.seed}-${r.seedTo}-${r.open ?? ""}`;
    const evaluate = (scores: Map<string, Score>): string | null => {
      const games = input.games.map((x) => {
        const p = scores.get(x.id);
        if (!p) return x;
        const home = picks.get(x.id) === "home";
        return { ...x, scoreHome: home ? p.w : p.l, scoreAway: home ? p.l : p.w };
      });
      const r = ourRow(input, ourId, rest, games)?.row;
      if (!r) return null;
      const res = { seed: r.seed, seedTo: r.seedTo, open: r.open };
      results.set(keyOf(res), res);
      return keyOf(res);
    };
    const win = (g: SGame) => picks.get(g.id)!;
    const all = SCORES.map((_, i) => i);

    if (relevant.length === 1) {
      const g = relevant[0]!;
      const keys: string[] = [];
      for (const p of SCORES) {
        const k = evaluate(new Map([[g.id, p]]));
        if (k === null) return null;
        keys.push(k);
      }
      const out = splitGame(all, (i) => keys[i]!, g.id, win(g));
      if (!out) return null;
      return out.map((o) => ({ result: results.get(o.key)!, conds: o.conds, dependsOn: [] }));
    }

    // Two games: every score of both.
    const [ga, gb] = relevant as [SGame, SGame];
    const grid: string[][] = [];
    for (const pa of SCORES) {
      const row: string[] = [];
      for (const pb of SCORES) {
        const k = evaluate(
          new Map([
            [ga.id, pa],
            [gb.id, pb],
          ]),
        );
        if (k === null) return null;
        row.push(k);
      }
      grid.push(row);
    }
    const at = (first: SGame, i: number, j: number) => (first === ga ? grid[i]![j]! : grid[j]![i]!);

    const tryOrder = (first: SGame, second: SGame): Split[] | null => {
      // Scores of the first game that lead to the same thing whatever the second's score.
      const outer = splitGame(
        all,
        (i) => all.map((j) => at(first, i, j)).join("|"),
        first.id,
        win(first),
      );
      if (!outer) return null;
      const out: Split[] = [];
      for (const o of outer) {
        const i = o.members[0]!;
        const inner = splitGame(all, (j) => at(first, i, j), second.id, win(second));
        if (!inner) return null;
        for (const n of inner) {
          out.push({ result: results.get(n.key)!, conds: [...o.conds, ...n.conds], dependsOn: [] });
        }
      }
      return out;
    };
    return (
      tryOrder(ga, gb) ??
      tryOrder(gb, ga) ??
      [...new Set(grid.flat())].map((k) => ({
        result: results.get(k)!,
        conds: [],
        dependsOn: [ga.id, gb.id],
      }))
    );
  }
}

/** Lowest and highest value of a kind that we try (the top means "or more"). */
const KIND_RANGE: Record<RunCond["kind"], [number, number]> = {
  margin: [1, MAX_RUNS],
  loserRuns: [0, MAX_RUNS - 1],
  winnerRuns: [1, MAX_RUNS],
};
const sideKey = (r: RunSide) => `${r.gameId}:${r.winner}:${r.kind}`;
const winsKey = (ws: WinCond[]) =>
  ws
    .map((w) => `${w.gameId}:${w.winner}`)
    .sort()
    .join(",");

/**
 * Two games' scores often count together (run differential adds margins up). A list like "we
 * lose by exactly 1 and Dogs win by 1 to 4, we lose by exactly 2 and Dogs win by 1 to 3, …"
 * becomes one line: our losing margin plus Dogs' winning margin is 5 or less.
 */
function combine(terms: Term[]): Term[] {
  const groups = new Map<string, { a: RunSide; b: RunSide; wins: WinCond[]; terms: Term[] }>();
  for (const t of terms) {
    if (t.runs.length !== 2 || t.dependsOnRuns || t.combo) continue;
    const [a, b] = t.runs as [RunCond, RunCond];
    // One value of the first game each ("exactly 3", or the top of what we tried).
    if (a.max === null ? a.min !== KIND_RANGE[a.kind][1] : a.min !== a.max) continue;
    const key = `${winsKey(t.wins)}|${sideKey(a)}|${sideKey(b)}`;
    const grp = groups.get(key) ?? { a, b, wins: t.wins, terms: [] };
    grp.terms.push(t);
    groups.set(key, grp);
  }
  const drop = new Set<Term>();
  const added: Term[] = [];
  for (const grp of groups.values()) {
    if (grp.terms.length < 2) continue;
    const [aLo, aHi] = KIND_RANGE[grp.a.kind];
    const [bLo, bHi] = KIND_RANGE[grp.b.kind];
    // "We lose by 6 or more, and Dogs beat Cubs" belongs too: any score of the second game.
    const bWin = winsKey([...grp.wins, { gameId: grp.b.gameId, winner: grp.b.winner }]);
    const edges = terms.filter(
      (t) =>
        t.runs.length === 1 &&
        !t.dependsOnRuns &&
        !t.combo &&
        sideKey(t.runs[0]!) === sideKey(grp.a) &&
        winsKey(t.wins) === bWin,
    );
    const inRange = (v: number, lo: number, hi: number | null) =>
      v >= lo && (hi === null || v <= hi);
    const region = new Set<string>();
    for (let x = aLo; x <= aHi; x++) {
      for (let y = bLo; y <= bHi; y++) {
        const hit =
          grp.terms.some(
            (t) =>
              inRange(x, t.runs[0]!.min, t.runs[0]!.max) &&
              inRange(y, t.runs[1]!.min, t.runs[1]!.max),
          ) || edges.some((t) => inRange(x, t.runs[0]!.min, t.runs[0]!.max));
        if (hit) region.add(`${x},${y}`);
      }
    }
    const fits = (f: (x: number, y: number) => boolean) => {
      for (let x = aLo; x <= aHi; x++)
        for (let y = bLo; y <= bHi; y++) if (f(x, y) !== region.has(`${x},${y}`)) return false;
      return true;
    };
    let combo: Combo | null = null;
    for (const op of ["sum", "diff"] as const) {
      const v = (x: number, y: number) => (op === "sum" ? x + y : x - y);
      const values = new Set<number>();
      for (const k of region) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        values.add(v(x, y));
      }
      if (!values.size) break;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const allLo = op === "sum" ? aLo + bLo : aLo - bHi;
      const allHi = op === "sum" ? aHi + bHi : aHi - bLo;
      if (!fits((x, y) => v(x, y) >= lo && v(x, y) <= hi)) continue;
      // The edge of what we tried means no limit that way.
      combo = {
        a: { gameId: grp.a.gameId, winner: grp.a.winner, kind: grp.a.kind },
        b: { gameId: grp.b.gameId, winner: grp.b.winner, kind: grp.b.kind },
        op,
        min: lo === allLo ? null : lo,
        max: hi === allHi ? null : hi,
      };
      break;
    }
    if (!combo || (combo.min === null && combo.max === null)) continue;
    for (const t of [...grp.terms, ...edges]) drop.add(t);
    added.push({ wins: grp.wins, runs: [], dependsOnRuns: false, combo });
  }
  return [...added, ...terms.filter((t) => !drop.has(t))];
}

/** Merge conditions that don't matter ("A beats B" or "B beats A" both lead here: drop it). */
function simplify(terms: Term[], games: number): Term[] {
  const sig = (t: Term) =>
    JSON.stringify([
      t.wins.map((w) => `${w.gameId}:${w.winner}`).sort(),
      t.runs,
      t.dependsOnRuns,
      t.runsGames ?? [],
      t.combo ?? null,
    ]);
  let level = new Map(terms.map((t) => [sig(t), t]));
  const final = new Map<string, Term>();
  for (let round = 0; round <= games && level.size; round++) {
    const next = new Map<string, Term>();
    const merged = new Set<string>();
    for (const [s, t] of level) {
      for (const w of t.wins) {
        const flip: Term = {
          ...t,
          wins: t.wins.map((x) =>
            x === w ? { ...x, winner: x.winner === "home" ? "away" : "home" } : x,
          ),
        };
        const fs = sig(flip);
        if (level.has(fs)) {
          const m: Term = { ...t, wins: t.wins.filter((x) => x !== w) };
          next.set(sig(m), m);
          merged.add(s);
          merged.add(fs);
        }
      }
    }
    for (const [s, t] of level) if (!merged.has(s)) final.set(s, t);
    level = next;
  }
  // Drop terms that a shorter one already covers.
  const list = [...final.values()].sort((a, b) => a.wins.length - b.wins.length);
  const kept: Term[] = [];
  for (const t of list) {
    const covered = kept.some(
      (k) =>
        JSON.stringify(k.runs) === JSON.stringify(t.runs) &&
        k.dependsOnRuns === t.dependsOnRuns &&
        JSON.stringify(k.runsGames ?? []) === JSON.stringify(t.runsGames ?? []) &&
        k.wins.every((w) => t.wins.some((x) => x.gameId === w.gameId && x.winner === w.winner)),
    );
    if (!covered) kept.push(t);
  }
  return kept;
}

/** The first bracket game for a seed (a "Seed 4" or "2nd Pool A" side), earliest first. */
export function firstGameForSeed<
  T extends SGame & { date: string | null; startTime: string | null },
>(games: T[], seed: number, pool: string | null): { game: T; opponent: string } | null {
  const mine = (side: string) => {
    const p = parsePlaceholder(side);
    if (!p) return false;
    if (pool) return p.kind === "pool" && p.n === seed && teamKey(p.pool) === teamKey(pool);
    return p.kind === "seed" && p.n === seed;
  };
  const found = games
    .filter((g) => g.stage === "bracket" && (mine(g.home) || mine(g.away)))
    .sort(
      (a, b) =>
        (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
        (a.startTime ?? "99").localeCompare(b.startTime ?? "99"),
    )[0];
  if (!found) return null;
  return { game: found, opponent: mine(found.home) ? found.away : found.home };
}

/** Plain words for one way to get there. */
export function describeTerm(
  term: Term,
  games: SGame[],
  input: Pick<StandingsInput, "teams">,
  ourId: string,
): string {
  if (term.wins.length === 0 && term.runs.length === 0 && !term.combo) {
    return term.dependsOnRuns ? "Depends on the scores" : "No matter what happens";
  }
  const name = (g: SGame, side: WinPick) => {
    const t =
      side === "home"
        ? sideTeam(g.home, g.homeTeamId, input.teams)
        : sideTeam(g.away, g.awayTeamId, input.teams);
    return { name: t?.name ?? (side === "home" ? g.home : g.away), us: t?.id === ourId };
  };
  // Our own games first, then the rest.
  const parts: { text: string; us: boolean }[] = [];
  for (const w of term.wins) {
    const g = games.find((x) => x.id === w.gameId);
    if (!g) continue;
    const win = name(g, w.winner);
    const lose = name(g, w.winner === "home" ? "away" : "home");
    parts.push({
      text: win.us
        ? `we beat ${lose.name}`
        : lose.us
          ? `we lose to ${win.name}`
          : `${win.name} beat ${lose.name}`,
      us: win.us || lose.us,
    });
  }
  // One phrase per game: "we lose to Bats by 1 to 2 runs, with Bats scoring 4 or fewer runs".
  for (const gameId of [...new Set(term.runs.map((r) => r.gameId))]) {
    const g = games.find((x) => x.id === gameId);
    const conds = term.runs.filter((r) => r.gameId === gameId);
    if (!g || !conds.length) continue;
    const winner = conds[0]!.winner;
    const win = name(g, winner);
    const lose = name(g, winner === "home" ? "away" : "home");
    const range = (r: RunCond) => {
      const unit = r.min === 1 && r.max === 1 ? "run" : "runs";
      return r.max === null
        ? `${r.min} or more ${unit}`
        : r.max === r.min
          ? r.min === 0
            ? "no runs"
            : `exactly ${r.min} ${unit}`
          : r.min === 0
            ? `${r.max} or fewer ${unit}`
            : `${r.min} to ${r.max} ${unit}`;
    };
    let text = win.us
      ? `we beat ${lose.name}`
      : lose.us
        ? `we lose to ${win.name}`
        : `${win.name} beat ${lose.name}`;
    const margin = conds.find((r) => r.kind === "margin");
    if (margin) text += ` by ${range(margin)}`;
    const scoring = conds
      .filter((r) => r.kind !== "margin")
      .map((r) => {
        const who = r.kind === "loserRuns" ? lose : win;
        return `${who.us ? "us" : who.name} scoring ${range(r)}`;
      });
    if (scoring.length) text += `, with ${scoring.join(" and ")}`;
    parts.push({ text, us: win.us || lose.us });
  }
  if (term.combo) {
    const c = term.combo;
    const ga = games.find((x) => x.id === c.a.gameId);
    const gb = games.find((x) => x.id === c.b.gameId);
    if (ga && gb) {
      const subject = (g: SGame, side: RunSide) => {
        const w = name(g, side.winner);
        const l = name(g, side.winner === "home" ? "away" : "home");
        return w.us
          ? `we beat ${l.name}`
          : l.us
            ? `we lose to ${w.name}`
            : `${w.name} beat ${l.name}`;
      };
      /** Whose number it is, and against whom ("Eels' runs vs Cubs"). */
      const amountOf = (g: SGame, side: RunSide) => {
        const w = name(g, side.winner);
        const l = name(g, side.winner === "home" ? "away" : "home");
        const [who, opp] = side.kind === "loserRuns" ? [l, w] : [w, l];
        const own = who.us ? "our" : who.name.endsWith("s") ? `${who.name}'` : `${who.name}'s`;
        const what =
          side.kind === "margin"
            ? w.us
              ? "our winning margin"
              : l.us
                ? "our losing margin"
                : `${own} winning margin`
            : `${own} runs`;
        return { who: who.name, what, vs: opp.us ? "us" : opp.name };
      };
      const [xa, xb] = [amountOf(ga, c.a), amountOf(gb, c.b)];
      // The same team in both: say which game each number is from.
      const same = xa.who === xb.who;
      let [qa, qb] = [xa, xb].map((x) => (same ? `${x.what} vs ${x.vs}` : x.what)) as [
        string,
        string,
      ];
      let { min, max } = c;
      // Keep the numbers positive: "b minus a is 2 or more" over "a minus b is -2 or less".
      if (c.op === "diff" && (max ?? min ?? 0) < 0) {
        [qa, qb] = [qb, qa];
        [min, max] = [max === null ? null : -max, min === null ? null : -min];
      }
      let words: string;
      if (c.op === "sum") {
        words = `adding up to ${
          min === null
            ? `${max} or less`
            : max === null
              ? `${min} or more`
              : min === max
                ? `exactly ${min}`
                : `${min} to ${max}`
        }`;
      } else {
        const more = (n: number) => (n === 0 ? "the same as" : `${n} more than`);
        words =
          min === null
            ? `at most ${more(max!)} ${qb}`
            : max === null
              ? `at least ${more(min)} ${qb}`
              : min === max
                ? `exactly ${more(min)} ${qb}`
                : `${min} to ${max} more than ${qb}`;
      }
      const us = [ga, gb].some((g) => name(g, "home").us || name(g, "away").us);
      parts.push({
        text:
          c.op === "sum"
            ? `${subject(ga, c.a)} and ${subject(gb, c.b)}, with ${qa} and ${qb} ${words}`
            : `${subject(ga, c.a)} and ${subject(gb, c.b)}, with ${qa} ${words}`,
        us,
      });
    }
  }
  if (term.dependsOnRuns) {
    const named = (term.runsGames ?? [])
      .map((id) => games.find((x) => x.id === id))
      .filter((g): g is SGame => !!g)
      .map((g) => {
        const h = name(g, "home");
        const a = name(g, "away");
        return h.us
          ? `our score vs ${a.name}`
          : a.us
            ? `our score vs ${h.name}`
            : `the ${h.name} vs ${a.name} score`;
      });
    parts.push({
      text: named.length
        ? `then it depends on ${named.join(" and ")}`
        : "then it depends on several scores",
      us: false,
    });
  }
  const ordered = [...parts.filter((p) => p.us), ...parts.filter((p) => !p.us)];
  const text = ordered.map((p) => p.text).join(", and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How many things have to happen for this way (short ones are worth showing). */
export function termSize(term: Term): number {
  return term.wins.length + term.runs.length + (term.combo ? 2 : 0) + (term.dependsOnRuns ? 1 : 0);
}

export interface Slot<T> {
  /** The bracket game (null when the bracket isn't in yet: one slot per seed). */
  game: T | null;
  seeds: number[];
  /** Who we'd play, for a single seed. */
  opponent: string | null;
  /** Any of these gets us here. */
  terms: Term[];
  /** The seed (or seeds, when not settled) each term leads to. */
  seedOf: Map<Term, { seed: number; seedTo: number }>;
  /** Why we might land here or in another slot: scores we couldn't work out, or a tie the
   * tie-breakers don't break (the tournament settles it). Null when it's certain. */
  unsure: "runs" | "tied" | null;
}

/** Outcomes grouped by the bracket game they lead to, earliest first. */
export function bySlot<T extends SGame & { date: string | null; startTime: string | null }>(
  outcomes: Outcome[],
  games: T[],
  pool: string | null,
): Slot<T>[] {
  const slots = new Map<string, Slot<T> & { opponents: Set<string> }>();
  for (const o of outcomes) {
    for (let n = o.seed; n <= o.seedTo; n++) {
      const f = firstGameForSeed(games, n, pool);
      const key = f ? f.game.id : `seed-${n}`;
      const slot: Slot<T> & { opponents: Set<string> } = slots.get(key) ?? {
        game: f?.game ?? null,
        seeds: [],
        opponent: null,
        opponents: new Set<string>(),
        terms: [],
        seedOf: new Map(),
        unsure: null,
      };
      if (!slot.seeds.includes(n)) slot.seeds.push(n);
      if (f) slot.opponents.add(f.opponent);
      for (const t of o.terms) {
        if (!slot.seedOf.has(t)) slot.terms.push(t);
        slot.seedOf.set(t, { seed: o.seed, seedTo: o.seedTo });
      }
      if (o.seedTo > o.seed) {
        slot.unsure = o.open === "runs" || slot.unsure === "runs" ? "runs" : "tied";
      }
      slots.set(key, slot);
    }
  }
  return [...slots.values()]
    .map(({ opponents, ...s }) => ({
      ...s,
      seeds: s.seeds.sort((a, b) => a - b),
      opponent: opponents.size === 1 ? [...opponents][0]! : null,
    }))
    .sort(
      (a, b) =>
        Number(!a.game) - Number(!b.game) ||
        (a.game?.date ?? "").localeCompare(b.game?.date ?? "") ||
        (a.game?.startTime ?? "").localeCompare(b.game?.startTime ?? "") ||
        a.seeds[0]! - b.seeds[0]!,
    );
}
