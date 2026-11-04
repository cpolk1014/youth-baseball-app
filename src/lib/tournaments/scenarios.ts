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
const RUN_BUDGET = 120_000;

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
}

export interface Outcome {
  seed: number;
  /** Bigger than seed when a coin flip (or an unbreakable tie) settles it. */
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
      add(s.result, {
        wins: s.cond ? wins.filter((w) => w.gameId !== s.cond!.gameId) : wins,
        runs: s.cond ? [s.cond] : [],
        dependsOnRuns: false,
      });
    }
  }

  const outcomes = [...byOutcome.values()]
    .map(({ result, terms }) => ({ ...result, terms: simplify(terms, left.length) }))
    .sort((a, b) => a.seed - b.seed || a.seedTo - b.seedTo);
  return { remaining: left.length, tooMany: false, outcomes };
}

/**
 * A tie that runs settle: try the scores of the one game left that involves the tied teams,
 * and describe the result by the winning margin, the loser's runs or the winner's runs,
 * whichever decides it. Null when more than one game is in play or none of those does.
 */
function byRuns(
  input: StandingsInput,
  ourId: string,
  picks: Map<string, WinPick>,
  left: SGame[],
  tied: Set<string>,
  budget: { left: number },
): { result: Result; cond: RunCond | null }[] | null {
  const relevant = left.filter((g) =>
    [sideTeam(g.home, g.homeTeamId, input.teams), sideTeam(g.away, g.awayTeamId, input.teams)].some(
      (t) => t && tied.has(t.id),
    ),
  );
  if (relevant.length !== 1) return null;
  const g = relevant[0]!;
  const winner = picks.get(g.id)!;
  const pairs: { w: number; l: number }[] = [];
  for (let w = 1; w <= MAX_RUNS; w++) for (let l = 0; l < w; l++) pairs.push({ w, l });
  if (budget.left < pairs.length) return null;
  budget.left -= pairs.length;

  const rest = new Map(picks);
  rest.delete(g.id);
  const outcome = new Map<string, Result>();
  for (const p of pairs) {
    const games = input.games.map((x) =>
      x.id === g.id
        ? {
            ...x,
            scoreHome: winner === "home" ? p.w : p.l,
            scoreAway: winner === "home" ? p.l : p.w,
          }
        : x,
    );
    const r = ourRow(input, ourId, rest, games)?.row;
    if (!r) return null;
    outcome.set(`${p.w}-${p.l}`, { seed: r.seed, seedTo: r.seedTo, open: r.open });
  }
  const key = (r: Result) => `${r.seed}-${r.seedTo}-${r.open ?? ""}`;

  for (const kind of ["margin", "loserRuns", "winnerRuns"] as const) {
    const value = (p: { w: number; l: number }) =>
      kind === "margin" ? p.w - p.l : kind === "loserRuns" ? p.l : p.w;
    const byValue = new Map<number, Result>();
    let fits = true;
    for (const p of pairs) {
      const r = outcome.get(`${p.w}-${p.l}`)!;
      const v = value(p);
      const seen = byValue.get(v);
      if (seen && key(seen) !== key(r)) {
        fits = false;
        break;
      }
      byValue.set(v, r);
    }
    if (!fits) continue;
    // Runs of equal values → one condition each ("by 1 to 4", "by 5 or more").
    const values = [...byValue.keys()].sort((a, b) => a - b);
    const top = values.at(-1)!;
    const out: { result: Result; cond: RunCond | null }[] = [];
    let start = values[0]!;
    for (let i = 1; i <= values.length; i++) {
      const v = values[i];
      const prev = values[i - 1]!;
      if (v === undefined || key(byValue.get(v)!) !== key(byValue.get(prev)!)) {
        out.push({
          result: byValue.get(prev)!,
          cond: {
            gameId: g.id,
            winner,
            kind,
            min: start,
            // The top of what we tried counts as "or more" (a bigger score goes the same way).
            max: prev === top && kind !== "loserRuns" ? null : prev,
          },
        });
        if (v !== undefined) start = v;
      }
    }
    // Losers' runs go up to one less than the winner's: say "or more" for the top too.
    if (kind === "loserRuns") out.at(-1)!.cond!.max = null;
    // The score makes no difference after all.
    if (out.length === 1) return [{ result: out[0]!.result, cond: null }];
    return out;
  }
  return null;
}

/** Merge conditions that don't matter ("A beats B" or "B beats A" both lead here: drop it). */
function simplify(terms: Term[], games: number): Term[] {
  const sig = (t: Term) =>
    JSON.stringify([t.wins.map((w) => `${w.gameId}:${w.winner}`).sort(), t.runs, t.dependsOnRuns]);
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
  if (term.wins.length === 0 && term.runs.length === 0) {
    return term.dependsOnRuns ? "Depends on runs scored and allowed" : "No matter what happens";
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
  if (term.dependsOnRuns) parts.push({ text: "then runs decide it", us: false });
  const ordered = [...parts.filter((p) => p.us), ...parts.filter((p) => !p.us)];
  const text = ordered.map((p) => p.text).join(", and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How many things have to happen for this way (short ones are worth showing). */
export function termSize(term: Term): number {
  return term.wins.length + term.runs.length + (term.dependsOnRuns ? 1 : 0);
}

export interface Slot<T> {
  /** The bracket game (null when the bracket isn't in yet: one slot per seed). */
  game: T | null;
  seeds: number[];
  /** Who we'd play, for a single seed. */
  opponent: string | null;
  /** Any of these gets us here. */
  terms: Term[];
  /** A coin flip (or an unbreakable tie) decides between this slot and another. */
  coin: boolean;
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
        coin: false,
      };
      if (!slot.seeds.includes(n)) slot.seeds.push(n);
      if (f) slot.opponents.add(f.opponent);
      slot.terms.push(...o.terms);
      if (o.seedTo > o.seed) slot.coin = true;
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
