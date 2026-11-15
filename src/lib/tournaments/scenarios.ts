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
const RUN_BUDGET = 300_000;

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
    const split = byRuns(input, ourId, picks, left, tied, budget);
    if (!split) {
      add(row, { wins, runs: [], dependsOnRuns: true });
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
const SCORES: Score[] = [];
for (let w = 1; w <= MAX_RUNS; w++) for (let l = 0; l < w; l++) SCORES.push({ w, l });

/**
 * Group a game's scores by the winning margin, the loser's runs or the winner's runs (the
 * first that fits): runs of equal values that lead to the same key become one condition
 * ("by 1 to 3", "by 4 or more"). Null when none of them decides it.
 */
function ranges(
  keyOf: (i: number) => string,
  gameId: string,
  winner: WinPick,
): { key: string; cond: RunCond; members: number[] }[] | null {
  for (const kind of ["margin", "loserRuns", "winnerRuns"] as const) {
    const value = (p: Score) => (kind === "margin" ? p.w - p.l : kind === "loserRuns" ? p.l : p.w);
    const byValue = new Map<number, { key: string; members: number[] }>();
    let fits = true;
    for (let i = 0; i < SCORES.length; i++) {
      const v = value(SCORES[i]!);
      const k = keyOf(i);
      const seen = byValue.get(v);
      if (seen && seen.key !== k) {
        fits = false;
        break;
      }
      if (seen) seen.members.push(i);
      else byValue.set(v, { key: k, members: [i] });
    }
    if (!fits) continue;
    const values = [...byValue.keys()].sort((a, b) => a - b);
    const top = values.at(-1)!;
    const out: { key: string; cond: RunCond; members: number[] }[] = [];
    let start = values[0]!;
    let members: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      members.push(...byValue.get(v)!.members);
      const next = values[i + 1];
      if (next === undefined || byValue.get(next)!.key !== byValue.get(v)!.key) {
        out.push({
          key: byValue.get(v)!.key,
          // The top of what we tried counts as "or more" (a bigger score goes the same way).
          cond: { gameId, winner, kind, min: start, max: v === top ? null : v },
          members,
        });
        members = [];
        if (next !== undefined) start = next;
      }
    }
    return out;
  }
  return null;
}

/**
 * A tie that runs settle: try every score of the games left that involve the tied teams (up
 * to two; ours first) and say what each leads to, by the winning margin, the loser's runs or
 * the winner's runs. With two games, the second game's score is named only where it matters;
 * where neither can be put simply, the outcome "depends on" that game's score. Null when more
 * than two games are in play (or it would take too long).
 */
function byRuns(
  input: StandingsInput,
  ourId: string,
  picks: Map<string, WinPick>,
  left: SGame[],
  tied: Set<string>,
  budget: { left: number },
): { result: Result; conds: RunCond[]; dependsOn: string[] }[] | null {
  const teamsIn = (g: SGame) => [
    sideTeam(g.home, g.homeTeamId, input.teams),
    sideTeam(g.away, g.awayTeamId, input.teams),
  ];
  const relevant = left
    .filter((g) => teamsIn(g).some((t) => t && tied.has(t.id)))
    .sort(
      (a, b) =>
        Number(teamsIn(b).some((t) => t?.id === ourId)) -
        Number(teamsIn(a).some((t) => t?.id === ourId)),
    );
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

  if (relevant.length === 1) {
    const g = relevant[0]!;
    const keys: string[] = [];
    for (const p of SCORES) {
      const k = evaluate(new Map([[g.id, p]]));
      if (k === null) return null;
      keys.push(k);
    }
    const out = ranges((i) => keys[i]!, g.id, win(g));
    if (!out) return null;
    // The score makes no difference after all.
    if (out.length === 1) return [{ result: results.get(out[0]!.key)!, conds: [], dependsOn: [] }];
    return out.map((o) => ({ result: results.get(o.key)!, conds: [o.cond], dependsOn: [] }));
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

  const tryOrder = (first: SGame, second: SGame) => {
    // Scores of the first game that lead to the same thing whatever the second's score.
    const outer = ranges(
      (i) => SCORES.map((_, j) => at(first, i, j)).join("|"),
      first.id,
      win(first),
    );
    if (!outer) return null;
    const out: { result: Result; conds: RunCond[]; dependsOn: string[] }[] = [];
    for (const o of outer) {
      const firstConds = outer.length > 1 ? [o.cond] : [];
      const i = o.members[0]!;
      const keys = new Set(SCORES.map((_, j) => at(first, i, j)));
      if (keys.size === 1) {
        out.push({ result: results.get([...keys][0]!)!, conds: firstConds, dependsOn: [] });
        continue;
      }
      const inner = ranges((j) => at(first, i, j), second.id, win(second));
      if (inner) {
        for (const n of inner) {
          out.push({ result: results.get(n.key)!, conds: [...firstConds, n.cond], dependsOn: [] });
        }
      } else {
        for (const k of keys) {
          out.push({ result: results.get(k)!, conds: firstConds, dependsOn: [second.id] });
        }
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
  for (const r of term.runs) {
    const g = games.find((x) => x.id === r.gameId);
    if (!g) continue;
    const win = name(g, r.winner);
    const lose = name(g, r.winner === "home" ? "away" : "home");
    const range = (unit: string) =>
      r.max === null
        ? `${r.min} or more ${unit}`
        : r.max === r.min
          ? `exactly ${r.min} ${unit}`
          : r.min === 0
            ? `${r.max} or fewer ${unit}`
            : `${r.min} to ${r.max} ${unit}`;
    const unit = r.min === 1 && r.max === 1 ? "run" : "runs";
    const subject = win.us
      ? `we beat ${lose.name}`
      : lose.us
        ? `we lose to ${win.name}`
        : `${win.name} beat ${lose.name}`;
    const us = win.us || lose.us;
    if (r.kind === "margin") {
      parts.push({ text: `${subject} by ${range(unit)}`, us });
    } else if (r.kind === "loserRuns") {
      parts.push({
        text: `${subject}, with ${lose.us ? "us" : lose.name} scoring ${range(unit)}`,
        us,
      });
    } else {
      parts.push({
        text: `${subject}, with ${win.us ? "us" : win.name} scoring ${range(unit)}`,
        us,
      });
    }
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
      const amount = (g: SGame, side: RunSide) => {
        const w = name(g, side.winner);
        const l = name(g, side.winner === "home" ? "away" : "home");
        const own = (who: { name: string; us: boolean }) =>
          who.us ? "our" : who.name.endsWith("s") ? `${who.name}'` : `${who.name}'s`;
        return side.kind === "margin"
          ? w.us
            ? "our winning margin"
            : l.us
              ? "our losing margin"
              : `${own(w)} winning margin`
          : side.kind === "loserRuns"
            ? `${own(l)} runs`
            : `${own(w)} runs`;
      };
      let [qa, qb] = [amount(ga, c.a), amount(gb, c.b)];
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
      const slot = slots.get(key) ?? {
        game: f?.game ?? null,
        seeds: [],
        opponent: null,
        opponents: new Set<string>(),
        terms: [],
        unsure: null,
      };
      if (!slot.seeds.includes(n)) slot.seeds.push(n);
      if (f) slot.opponents.add(f.opponent);
      slot.terms.push(...o.terms);
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
