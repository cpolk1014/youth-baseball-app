// Tournaments, phase 4: standings from the pool games' scores, broken with the tournament's
// tie-break rules; the range of seeds we can still finish (what-ifs); and filling the
// bracket's "Seed 3" / "Winner Game 7" sides with real teams (pure: no I/O).
import { teamKey } from "./event";
import { parsePlaceholder } from "./schedule";
import { RUN_CRITERIA, describeCriterion, type Criterion } from "./tiebreak";

export interface STeam {
  id: string;
  name: string;
}

export interface SGame {
  id: string;
  gameNo: string | null;
  stage: "pool" | "bracket";
  pool: string | null;
  home: string;
  away: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
}

/** A what-if pick for a game without a score: who wins (runs unknown). */
export type Pick = "home" | "away";

interface Result {
  opp: string;
  rs: number | null;
  ra: number | null;
  /** 1 win, 0 loss, 0.5 tie. */
  pts: number;
}

interface Rec {
  id: string;
  name: string;
  pool: string | null;
  results: Result[];
}

export interface StandingRow {
  teamId: string;
  name: string;
  pool: string | null;
  w: number;
  l: number;
  t: number;
  /** Null when a what-if game's runs aren't known. */
  rs: number | null;
  ra: number | null;
  seed: number;
  /** Last seed this team could be when its tie isn't broken (same as seed when it is). */
  seedTo: number;
  /** What put it in its place among teams with the same record (null: its record did). */
  decidedBy: string | null;
  /** Why a tie is still open: it depends on runs (what-ifs), a coin flip, or nothing breaks it. */
  open: "runs" | "coin" | "tied" | null;
}

/**
 * The team a side of a game is: one on the tournament's team list, or else the name on the
 * schedule (so a team missing from the list still counts). Null for placeholders like
 * "1st Pool A" or "Winner Game 7".
 */
export function sideTeam(name: string, id: string | null, teams: STeam[]): STeam | null {
  if (id) {
    const t = teams.find((x) => x.id === id);
    if (t) return t;
  }
  const k = teamKey(name);
  const listed = teams.find((x) => teamKey(x.name) === k);
  if (listed) return listed;
  if (!k || parsePlaceholder(name)) return null;
  return { id: `name:${k}`, name: name.trim() };
}

/** Each team's pool games (scored, or picked in a what-if). */
function records(teams: STeam[], games: SGame[], picks: Map<string, Pick>): Rec[] {
  const recs = new Map<string, Rec>();
  const poolCount = new Map<string, Map<string, number>>();
  const rec = (t: STeam) => {
    let r = recs.get(t.id);
    if (!r) recs.set(t.id, (r = { id: t.id, name: t.name, pool: null, results: [] }));
    return r;
  };
  for (const g of games) {
    if (g.stage !== "pool") continue;
    const h = sideTeam(g.home, g.homeTeamId, teams);
    const a = sideTeam(g.away, g.awayTeamId, teams);
    if (!h || !a || h.id === a.id) continue;
    for (const t of [h, a]) {
      rec(t);
      if (g.pool) {
        const m = poolCount.get(t.id) ?? new Map<string, number>();
        m.set(g.pool, (m.get(g.pool) ?? 0) + 1);
        poolCount.set(t.id, m);
      }
    }
    let hp: number;
    let hs: number | null = null;
    let as: number | null = null;
    if (g.scoreHome !== null && g.scoreAway !== null) {
      hs = g.scoreHome;
      as = g.scoreAway;
      hp = hs > as ? 1 : hs < as ? 0 : 0.5;
    } else {
      const p = picks.get(g.id);
      if (!p) continue;
      hp = p === "home" ? 1 : 0;
    }
    rec(h).results.push({ opp: a.id, rs: hs, ra: as, pts: hp });
    rec(a).results.push({ opp: h.id, rs: as, ra: hs, pts: 1 - hp });
  }
  for (const [id, m] of poolCount) {
    const r = recs.get(id)!;
    r.pool = [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0];
  }
  return [...recs.values()];
}

const pct = (rs: Result[]) => (rs.length ? rs.reduce((n, r) => n + r.pts, 0) / rs.length : 0);

type Bucket = { ids: string[]; by: string | null; open: StandingRow["open"] };

/** Order a group of teams with the same record by the rules. */
function breakTie(group: Rec[], rules: Criterion[], restart: boolean, from: number): Bucket[] {
  if (group.length === 1) return [{ ids: [group[0]!.id], by: null, open: null }];
  for (let i = from; i < rules.length; i++) {
    const c = rules[i]!;
    if (c.type === "coin_flip") return [{ ids: group.map((r) => r.id), by: null, open: "coin" }];
    const values = criterionValues(c, group);
    if (values === "skip") continue;
    if (values === "unknown") return [{ ids: group.map((r) => r.id), by: null, open: "runs" }];
    const levels = [...new Set(values.values())].sort((a, b) => b - a);
    if (levels.length === 1) continue;
    const out: Bucket[] = [];
    for (const v of levels) {
      const part = group.filter((r) => values.get(r.id) === v);
      if (part.length === 1) out.push({ ids: [part[0]!.id], by: describeCriterion(c), open: null });
      else {
        const sub = breakTie(part, rules, restart, restart ? 0 : i + 1);
        // Teams separated further down still owe their place partly to this criterion.
        out.push(...sub.map((b) => ({ ...b, by: b.by ?? (b.open ? null : describeCriterion(c)) })));
      }
    }
    return out;
  }
  return [{ ids: group.map((r) => r.id), by: null, open: "tied" }];
}

/** Each team's value for a criterion (bigger is better), or why it can't be used. */
function criterionValues(c: Criterion, group: Rec[]): Map<string, number> | "skip" | "unknown" {
  const ids = new Set(group.map((r) => r.id));
  if (c.type === "head_to_head") {
    // Counts only when every tied team played every other.
    for (const r of group) {
      const opps = new Set(r.results.map((x) => x.opp));
      for (const o of ids) if (o !== r.id && !opps.has(o)) return "skip";
    }
    return new Map(group.map((r) => [r.id, pct(r.results.filter((x) => ids.has(x.opp)))]));
  }
  if (RUN_CRITERIA.has(c.type)) {
    if (group.some((r) => r.results.some((x) => x.rs === null || x.ra === null))) return "unknown";
    const cap = c.cap ?? Infinity;
    const out = new Map<string, number>();
    for (const r of group) {
      const n = Math.max(r.results.length, 1);
      const rs = r.results.reduce((s, x) => s + Math.min(x.rs!, cap), 0);
      const ra = r.results.reduce((s, x) => s + Math.min(x.ra!, cap), 0);
      const rd = r.results.reduce((s, x) => s + Math.max(-cap, Math.min(cap, x.rs! - x.ra!)), 0);
      const v =
        c.type === "runs_allowed"
          ? -ra
          : c.type === "runs_scored"
            ? rs
            : c.type === "run_diff"
              ? rd
              : c.type === "runs_allowed_avg"
                ? -ra / n
                : c.type === "runs_scored_avg"
                  ? rs / n
                  : rd / n;
      out.set(r.id, Math.round(v * 1000) / 1000);
    }
    return out;
  }
  return "skip";
}

function rank(recs: Rec[], rules: Criterion[], restart: boolean): StandingRow[] {
  const byPct = new Map<number, Rec[]>();
  for (const r of recs) {
    const p = Math.round(pct(r.results) * 1e6) / 1e6;
    byPct.set(p, [...(byPct.get(p) ?? []), r]);
  }
  const rows: StandingRow[] = [];
  const recOf = new Map(recs.map((r) => [r.id, r]));
  for (const p of [...byPct.keys()].sort((a, b) => b - a)) {
    const group = byPct.get(p)!.sort((a, b) => a.name.localeCompare(b.name));
    for (const b of breakTie(group, rules, restart, 0)) {
      const seed = rows.length + 1;
      for (const id of b.ids) {
        const r = recOf.get(id)!;
        const known = r.results.every((x) => x.rs !== null && x.ra !== null);
        rows.push({
          teamId: id,
          name: r.name,
          pool: r.pool,
          w: r.results.filter((x) => x.pts === 1).length,
          l: r.results.filter((x) => x.pts === 0).length,
          t: r.results.filter((x) => x.pts === 0.5).length,
          rs: known ? r.results.reduce((s, x) => s + x.rs!, 0) : null,
          ra: known ? r.results.reduce((s, x) => s + x.ra!, 0) : null,
          seed,
          seedTo: seed + b.ids.length - 1,
          decidedBy: group.length > 1 ? b.by : null,
          open: b.open,
        });
      }
    }
  }
  return rows;
}

export interface StandingsInput {
  teams: STeam[];
  games: SGame[];
  rules: Criterion[];
  restart: boolean;
  seeding: "overall" | "pool";
  picks?: Map<string, Pick>;
}

/** Standings: one table overall, or one per pool (seeds within each pool). */
export function standings(input: StandingsInput): { pool: string | null; rows: StandingRow[] }[] {
  const recs = records(input.teams, input.games, input.picks ?? new Map());
  if (input.seeding === "overall") {
    return [{ pool: null, rows: rank(recs, input.rules, input.restart) }];
  }
  const pools = [...new Set(recs.map((r) => r.pool ?? ""))].sort();
  return pools.map((p) => ({
    pool: p || null,
    rows: rank(
      recs.filter((r) => (r.pool ?? "") === p),
      input.rules,
      input.restart,
    ),
  }));
}

/** Pool games still to be played between two known teams. */
export function remainingPoolGames<T extends SGame>(games: T[], teams: STeam[]): T[] {
  return games.filter(
    (g) =>
      g.stage === "pool" &&
      g.scoreHome === null &&
      sideTeam(g.home, g.homeTeamId, teams) &&
      sideTeam(g.away, g.awayTeamId, teams),
  );
}

export interface Seed {
  teamId: string;
  name: string;
  seed: number;
  pool: string | null;
}

/** Seeds from standings rows (a still-open tie keeps the order shown). */
export function seedsFrom(tables: { pool: string | null; rows: StandingRow[] }[]): Seed[] {
  return tables.flatMap((t) =>
    t.rows.map((r, i) => ({ teamId: r.teamId, name: r.name, seed: i + 1, pool: t.pool })),
  );
}

/**
 * Who a bracket side is: the team itself, or the team a placeholder now points to (a seed,
 * a pool finish, or the winner or loser of a scored game). Null until it's known.
 */
export function resolveSide(name: string, seeds: Seed[], games: SGame[], depth = 0): string | null {
  const p = parsePlaceholder(name);
  if (!p) return name;
  if (depth > 8) return null;
  if (p.kind === "seed") {
    const overall = seeds.every((s) => s.pool === null);
    return overall ? (seeds.find((s) => s.seed === p.n)?.name ?? null) : null;
  }
  if (p.kind === "pool") {
    return (
      seeds.find((s) => s.seed === p.n && teamKey(s.pool ?? "") === teamKey(p.pool))?.name ?? null
    );
  }
  // A bracket's numbers can start over at 1, so its own game comes before a pool game's.
  const numbered = games.filter((x) => x.gameNo && teamKey(x.gameNo) === teamKey(p.gameNo));
  const g = numbered.find((x) => x.stage === "bracket") ?? numbered[0];
  if (!g || g.scoreHome === null || g.scoreAway === null || g.scoreHome === g.scoreAway)
    return null;
  const homeWon = g.scoreHome > g.scoreAway;
  const side = (p.kind === "winner") === homeWon ? g.home : g.away;
  return resolveSide(side, seeds, games, depth + 1);
}

/** Bracket games whose placeholder sides can now be filled with teams. */
export function bracketFills(
  games: SGame[],
  seeds: Seed[],
): { id: string; home: string; away: string }[] {
  const out: { id: string; home: string; away: string }[] = [];
  for (const g of games) {
    if (g.stage !== "bracket") continue;
    const home = parsePlaceholder(g.home) ? resolveSide(g.home, seeds, games) : g.home;
    const away = parsePlaceholder(g.away) ? resolveSide(g.away, seeds, games) : g.away;
    if ((home && home !== g.home) || (away && away !== g.away)) {
      out.push({ id: g.id, home: home ?? g.home, away: away ?? g.away });
    }
  }
  return out;
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
export { ordinal };

/** The GroupMe post when the seeds are locked. */
export function seedingMessage(input: {
  tournament: string;
  seeds: Seed[];
  rows: StandingRow[];
  ourId: string | null;
  next: { when: string; place: string | null; opponent: string } | null;
}): string {
  const lines = [`Pool play is done at ${input.tournament}!`];
  const us = input.seeds.find((s) => s.teamId === input.ourId);
  const row = input.rows.find((r) => r.teamId === input.ourId);
  if (us) {
    const rec = row ? ` (${row.w}-${row.l}${row.t ? `-${row.t}` : ""})` : "";
    lines.push(`We're the ${ordinal(us.seed)} seed${us.pool ? ` in Pool ${us.pool}` : ""}${rec}.`);
  }
  if (input.next) {
    lines.push(
      `Next: ${input.next.when}${input.next.place ? ` at ${input.next.place}` : ""} vs ${input.next.opponent}.`,
    );
  }
  lines.push("");
  lines.push("Seeds:");
  for (const s of input.seeds) {
    lines.push(`${s.pool ? `${s.pool}${s.seed}` : s.seed}. ${s.name}`);
  }
  return lines.join("\n");
}
