// Tournaments: drawing the bracket. Works out which game feeds which from what the games say
// ("Winner Game 1", or a team that came through an earlier game once the bracket is filled in)
// and where each game sits on the page (pure: no I/O).
import { teamKey } from "./event";
import { parsePlaceholder } from "./schedule";

export interface BracketGame {
  id: string;
  gameNo: string | null;
  stage: "pool" | "bracket";
  date: string | null;
  startTime: string | null;
  home: string;
  away: string;
  scoreHome: number | null;
  scoreAway: number | null;
}

export const CARD_W = 196;
export const CARD_H = 112;
/** The top of the first team's row and each row's height inside a card. */
export const CARD_HEAD = 44;
export const ROW_H = 34;
const GAP_X = 36;
const GAP_Y = 20;
/** Room in the column before for a team that skips the first round. */
const BYE = (CARD_H + GAP_Y) / 2;
/** The space after the final for the champion. */
export const CHAMPION_W = 176;

export interface PlacedGame<T> {
  game: T;
  column: number;
  x: number;
  /** The card's top edge. */
  y: number;
}

export interface BracketTree<T> {
  games: PlacedGame<T>[];
  /** Connector lines as SVG paths. */
  lines: string[];
  /** The last game, which the champion comes out of. */
  final: PlacedGame<T>;
  columns: number;
  width: number;
  height: number;
}

const byTime = (a: BracketGame, b: BracketGame) =>
  (Number(a.gameNo) || Infinity) - (Number(b.gameNo) || Infinity) ||
  (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
  (a.startTime ?? "99").localeCompare(b.startTime ?? "99");

/** The earlier game that sends this side here as its winner, if any. */
function feederOf(side: string, before: BracketGame[]): BracketGame | null {
  const p = parsePlaceholder(side);
  if (p?.kind === "winner") {
    return before.find((g) => g.gameNo && teamKey(g.gameNo) === teamKey(p.gameNo)) ?? null;
  }
  if (p) return null; // a seed, a pool finish, or a loser dropping to another bracket
  // Filled in: the last game this team was in, unless they lost it.
  const k = teamKey(side);
  const last = before.filter((g) => teamKey(g.home) === k || teamKey(g.away) === k).at(-1);
  if (!last) return null;
  if (last.scoreHome !== null && last.scoreAway !== null) {
    const homeWon = last.scoreHome > last.scoreAway;
    if ((teamKey(last.home) === k) !== homeWon) return null;
  }
  return last;
}

/** The bracket's games laid out as trees, the biggest (the main bracket) first. */
export function bracketTrees<T extends BracketGame>(all: T[]): BracketTree<T>[] {
  const games = all.filter((g) => g.stage === "bracket").sort(byTime);
  const feeders = new Map<string, { home: T | null; away: T | null }>();
  const claimed = new Set<string>();
  games.forEach((g, i) => {
    const before = games.slice(0, i);
    const pick = (side: string) => {
      const f = feederOf(side, before) as T | null;
      if (!f || claimed.has(f.id)) return null;
      claimed.add(f.id);
      return f;
    };
    const home = pick(g.home);
    feeders.set(g.id, { home, away: pick(g.away) });
  });

  const depthBelow = (g: T): number => {
    const f = feeders.get(g.id)!;
    return 1 + Math.max(f.home ? depthBelow(f.home) : 0, f.away ? depthBelow(f.away) : 0);
  };

  const trees = games
    .filter((g) => !claimed.has(g.id))
    .map((root) => layOut(root, depthBelow(root), feeders))
    .sort((a, b) => b.games.length - a.games.length);
  // The main bracket ends with its champion.
  return trees.map((t, i) =>
    i === 0 && t.games.length > 1 ? { ...t, width: t.width + CHAMPION_W } : t,
  );
}

function layOut<T extends BracketGame>(
  root: T,
  columns: number,
  feeders: Map<string, { home: T | null; away: T | null }>,
): BracketTree<T> {
  const placed: PlacedGame<T>[] = [];
  const lines: string[] = [];
  const xOf = (column: number) => column * (CARD_W + GAP_X);

  const place = (g: T, level: number, top: number): { center: number; bottom: number } => {
    const f = feeders.get(g.id)!;
    const column = columns - 1 - level;
    let center: number;
    let bottom: number;
    const kids = [f.home, f.away];
    if (!f.home && !f.away) {
      center = top + CARD_H / 2;
      bottom = top + CARD_H + GAP_Y;
    } else {
      let cursor = top;
      const centers = kids.map((kid) => {
        if (!kid) {
          const c = cursor + BYE / 2;
          cursor += BYE;
          return c;
        }
        const r = place(kid, level + 1, cursor);
        cursor = r.bottom;
        return r.center;
      });
      center = (centers[0]! + centers[1]!) / 2;
      bottom = cursor;
      const left = xOf(column);
      const cardTop = center - CARD_H / 2;
      kids.forEach((kid, i) => {
        if (!kid) return;
        const fromX = xOf(column - 1) + CARD_W;
        const toY = cardTop + CARD_HEAD + ROW_H * i + ROW_H / 2;
        const mid = fromX + GAP_X / 2;
        lines.push(`M${fromX} ${centers[i]}H${mid}V${toY}H${left}`);
      });
    }
    placed.push({ game: g, column, x: xOf(column), y: center - CARD_H / 2 });
    return { center, bottom };
  };

  const { bottom } = place(root, 0, 0);
  return {
    games: placed,
    lines,
    final: placed.find((p) => p.game.id === root.id)!,
    columns,
    width: xOf(columns - 1) + CARD_W,
    height: bottom - GAP_Y,
  };
}

/** What to call a side that isn't a team yet. */
export function sideLabel(name: string): string {
  const p = parsePlaceholder(name);
  if (!p) return name;
  if (p.kind === "seed") return `Seed ${p.n}`;
  if (p.kind === "pool") return name;
  return `${p.kind === "winner" ? "Winner" : "Loser"} of Game ${p.gameNo}`;
}

/** Which side won (null until there's a final score). */
export function bracketWinner(g: BracketGame): "home" | "away" | null {
  if (g.scoreHome === null || g.scoreAway === null || g.scoreHome === g.scoreAway) return null;
  return g.scoreHome > g.scoreAway ? "home" : "away";
}
