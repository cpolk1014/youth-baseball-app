import { describe, expect, it } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { addToOutbox, applyOp, applyOutbox, isNetworkError, type OfflineOp } from "./offline";
import { SEED_DATA } from "./seed";

const game = SEED_DATA.games[0]!;
const lineup = { ...lineupFromGrid({ a: ["P", "C"] }), absent: ["b"] };

describe("offline changes", () => {
  it("applies a lineup, a result and a status like an online save", () => {
    const d = applyOutbox(SEED_DATA, [
      { kind: "lineup", gameId: game.id, lineup, seed: 3 },
      { kind: "gameResult", gameId: game.id, status: "final", scoreUs: 7, scoreThem: 4 },
    ]);
    expect(d.lineups[game.id]).toMatchObject({ absent: ["b"], autoFillSeed: 3, notBatting: [] });
    expect(d.games[0]).toMatchObject({ status: "final", scoreUs: 7, scoreThem: 4 });
    const reopened = applyOp(d, { kind: "gameStatus", gameId: game.id, status: "scheduled" });
    expect(reopened.games[0]).toMatchObject({ status: "scheduled", scoreUs: 7 });
  });

  it("keeps only the newest change of a kind per game, in the order made", () => {
    const first: OfflineOp = { kind: "lineup", gameId: "g1", lineup, seed: 1 };
    const score: OfflineOp = {
      kind: "gameResult",
      gameId: "g1",
      status: "final",
      scoreUs: 1,
      scoreThem: 0,
    };
    const second: OfflineOp = { kind: "lineup", gameId: "g1", lineup, seed: 2 };
    const other: OfflineOp = { kind: "lineup", gameId: "g2", lineup, seed: 1 };
    const box = [first, score, other].reduce(addToOutbox, [] as OfflineOp[]);
    expect(addToOutbox(box, second)).toEqual([score, other, second]);
  });

  it("tells a lost connection from a refused save", () => {
    expect(isNetworkError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
    expect(isNetworkError(new Error("only a coach can save this lineup"))).toBe(false);
    expect(isNetworkError(new Error("anything"), false)).toBe(true);
  });
});
