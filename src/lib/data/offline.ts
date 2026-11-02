import type { Lineup } from "@/lib/rules/types";
import type { AppData, GameLineup, GameStatus } from "./types";

// Working in a dugout with no signal: the last team data this device loaded is kept, and
// the changes a coach makes during a game (lineups, attendance, batting order, scores) wait
// in an outbox on the device until they can be saved. Pure helpers here; the store wires
// them to storage and the network.

/** A change that can be made offline and saved later. */
export type OfflineOp =
  | { kind: "lineup"; gameId: string; lineup: Lineup; seed: number }
  | {
      kind: "gameResult";
      gameId: string;
      status: GameStatus;
      scoreUs: number | null;
      scoreThem: number | null;
    }
  | { kind: "gameStatus"; gameId: string; status: GameStatus };

/** The device's copy of the team, from the last time it loaded online. */
export interface Snapshot {
  savedAt: string;
  email: string | null;
  data: AppData;
}

/** A change applied to the team's data (the same as making it online). */
export function applyOp(d: AppData, op: OfflineOp): AppData {
  if (op.kind === "lineup") {
    const next: GameLineup = {
      innings: op.lineup.innings,
      battingOrder: op.lineup.battingOrder,
      notBatting: op.lineup.notBatting ?? [],
      absent: op.lineup.absent ?? [],
      slots: op.lineup.slots,
      autoFillSeed: op.seed,
    };
    return { ...d, lineups: { ...d.lineups, [op.gameId]: next } };
  }
  const patch =
    op.kind === "gameResult"
      ? { status: op.status, scoreUs: op.scoreUs, scoreThem: op.scoreThem }
      : { status: op.status };
  return { ...d, games: d.games.map((g) => (g.id === op.gameId ? { ...g, ...patch } : g)) };
}

/** Changes still waiting, applied on top of data loaded from the server (or the device copy). */
export function applyOutbox(d: AppData, outbox: OfflineOp[]): AppData {
  return outbox.reduce(applyOp, d);
}

/**
 * Add a change to the outbox. A newer change of the same kind to the same game replaces the
 * older one (each holds the whole lineup or result), keeping the order changes were made.
 */
export function addToOutbox(outbox: OfflineOp[], op: OfflineOp): OfflineOp[] {
  return [...outbox.filter((o) => !(o.kind === op.kind && o.gameId === op.gameId)), op];
}

/** True when an error means "couldn't reach the server" rather than "the server said no". */
export function isNetworkError(e: unknown, online = true): boolean {
  if (!online) return true;
  const message = e instanceof Error ? e.message : String(e);
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|network connection was lost|internet connection appears to be offline/i.test(
    message,
  );
}
