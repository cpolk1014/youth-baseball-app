// Recent form for competitive lineups (pure): how each kid has hit lately, from the team's
// box scores game by game, or from the difference between two GameChanger imports (each one
// is season totals as of that day, so newer minus older is what happened in between). And
// season lines from box scores, for teams that don't import GameChanger's stats.
import { seasonTotals, type KidGame } from "@/lib/boxscore/stats";
import { addDays } from "@/lib/pitching/rest";
import type { RecentLine, StatLine } from "@/lib/rules/competitive";

export type { RecentLine };
import type { FieldPosition } from "@/lib/rules/types";
import { statNumber, type TeamStats } from "./gamechanger";

/** How far back "lately" goes. */
export const RECENT_DAYS = 14;

interface Counts {
  pa: number;
  ab: number;
  h: number;
  bb: number;
  hbp: number;
  sf: number;
  doubles: number;
  triples: number;
  hr: number;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

function rates(c: Counts) {
  const singles = Math.max(0, c.h - c.doubles - c.triples - c.hr);
  const tb = singles + 2 * c.doubles + 3 * c.triples + 4 * c.hr;
  const obp = div(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf);
  const slg = div(tb, c.ab);
  return {
    avg: div(c.h, c.ab),
    obp,
    slg,
    ops: obp !== null && slg !== null ? obp + slg : null,
  };
}

/** Each kid's hitting in the `days` before `before` (not counting that day), from box scores. */
export function recentFromBoxScores(
  lines: KidGame[],
  before: string,
  days = RECENT_DAYS,
): Map<string, RecentLine> {
  const from = addDays(before, -days);
  const byPlayer = new Map<string, KidGame[]>();
  for (const g of lines) {
    if (g.pitchOnly || !g.playerId || g.gameDate < from || g.gameDate >= before) continue;
    byPlayer.set(g.playerId, [...(byPlayer.get(g.playerId) ?? []), g]);
  }
  const out = new Map<string, RecentLine>();
  for (const [id, games] of byPlayer) {
    const b = seasonTotals(games).batting;
    const dates = games.map((g) => g.gameDate).sort();
    out.set(id, {
      pa: b.pa,
      ab: b.ab,
      h: b.h,
      avg: b.avg,
      obp: b.obp,
      slg: b.slg,
      ops: b.ops,
      from: dates[0]!,
      to: dates.at(-1)!,
      games: games.length,
      source: "box",
    });
  }
  return out;
}

/** Season lines from the team's box scores (fielding innings come from RallyCap's lineups). */
export function boxSeasonLines(
  lines: KidGame[],
  innings: Record<string, Partial<Record<FieldPosition, number>>>,
): Map<string, StatLine> {
  const byPlayer = new Map<string, KidGame[]>();
  for (const g of lines) {
    if (!g.playerId) continue;
    byPlayer.set(g.playerId, [...(byPlayer.get(g.playerId) ?? []), g]);
  }
  const out = new Map<string, StatLine>();
  for (const [id, games] of byPlayer) {
    const t = seasonTotals(games);
    const ip = (t.pitching?.outs ?? 0) / 3;
    out.set(id, {
      pa: t.batting.pa,
      obp: t.batting.obp,
      slg: t.batting.slg,
      ops: t.batting.ops,
      ip,
      whip: ip > 0 ? (t.pitching?.whip ?? null) : null,
      era: ip > 0 ? (t.pitching?.era ?? null) : null,
      // Box scores list errors but not putouts or assists.
      fpct: null,
      chances: 0,
      innings: innings[id] ?? {},
    });
  }
  return out;
}

export interface StatImport {
  importedAt: string;
  data: TeamStats;
}

const COUNT_KEYS: [keyof Counts, string][] = [
  ["pa", "PA"],
  ["ab", "AB"],
  ["h", "H"],
  ["bb", "BB"],
  ["hbp", "HBP"],
  ["sf", "SF"],
  ["doubles", "2B"],
  ["triples", "3B"],
  ["hr", "HR"],
];

function countsByPlayer(stats: TeamStats): Map<string, Counts> {
  const at = Object.fromEntries(
    COUNT_KEYS.map(([k, key]) => [
      k,
      stats.columns.findIndex((c) => c.group === "Batting" && c.key === key),
    ]),
  ) as Record<keyof Counts, number>;
  const out = new Map<string, Counts>();
  for (const p of stats.players) {
    if (!p.playerId) continue;
    const v = (i: number) => (i < 0 ? 0 : (statNumber(p.values[i] ?? "") ?? 0));
    out.set(
      p.playerId,
      Object.fromEntries(COUNT_KEYS.map(([k]) => [k, v(at[k])])) as unknown as Counts,
    );
  }
  return out;
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Each kid's hitting since an earlier import, from the latest import minus the one closest
 * to `days` before it (at least a week older, at most four weeks). None when the coach hasn't
 * imported far enough apart.
 */
export function recentFromImports(
  imports: StatImport[],
  days = RECENT_DAYS,
): Map<string, RecentLine> {
  const sorted = [...imports].sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  const latest = sorted.at(-1);
  if (!latest) return new Map();
  const to = day(latest.importedAt);
  const target = addDays(to, -days);
  const candidates = sorted.filter((i) => {
    const d = day(i.importedAt);
    return d <= addDays(to, -7) && d >= addDays(to, -28);
  });
  if (candidates.length === 0) return new Map();
  const gap = (i: StatImport) =>
    Math.abs(
      new Date(`${day(i.importedAt)}T12:00Z`).getTime() - new Date(`${target}T12:00Z`).getTime(),
    );
  const base = candidates.reduce((best, i) => (gap(i) < gap(best) ? i : best));
  const now = countsByPlayer(latest.data);
  const then = countsByPlayer(base.data);
  const out = new Map<string, RecentLine>();
  for (const [id, c] of now) {
    const b = then.get(id);
    const d = Object.fromEntries(
      COUNT_KEYS.map(([k]) => [k, Math.max(0, c[k] - (b?.[k] ?? 0))]),
    ) as unknown as Counts;
    // GameChanger's PA when it's there; otherwise add it up.
    if (d.pa === 0) d.pa = d.ab + d.bb + d.hbp + d.sf;
    if (d.pa === 0) continue;
    out.set(id, {
      pa: d.pa,
      ab: d.ab,
      h: d.h,
      ...rates(d),
      from: day(base.importedAt),
      to,
      games: null,
      source: "imports",
    });
  }
  return out;
}
