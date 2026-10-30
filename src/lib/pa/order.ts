// Who walks up, in order, for a game.
import type { Lineup, Player } from "@/lib/rules/types";
import type { Walkup } from "./types";

export interface Batter {
  order: number;
  player: Player;
  walkup: Walkup | null;
  /** Ready to play: a walk-up a coach has OK'd. */
  ready: boolean;
}

/** The game's batting order (kids sitting out or absent skipped), with each walk-up. */
export function batters(
  lineup: Lineup | undefined,
  players: Player[],
  walkups: Walkup[],
): Batter[] {
  if (!lineup) return [];
  const skip = new Set([...(lineup.notBatting ?? []), ...(lineup.absent ?? [])]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const byPlayer = new Map(walkups.map((w) => [w.playerId, w]));
  return lineup.battingOrder
    .filter((id) => !skip.has(id) && byId.has(id))
    .map((id, i) => {
      const walkup = byPlayer.get(id) ?? null;
      return { order: i + 1, player: byId.get(id)!, walkup, ready: walkup?.status === "approved" };
    });
}

/** Files the PA needs on the phone for a game: approved walk-ups and the team's sounds. */
export function filesFor(list: Batter[], soundPaths: string[]): string[] {
  const paths = list.flatMap((b) =>
    b.ready && b.walkup
      ? [
          b.walkup.songPath,
          ...(b.walkup.announce && b.walkup.announcePath ? [b.walkup.announcePath] : []),
        ]
      : [],
  );
  return [...new Set([...paths, ...soundPaths])];
}
