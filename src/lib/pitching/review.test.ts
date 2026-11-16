import { describe, expect, it } from "vitest";
import type { PitchSession } from "./rest";
import { pendingCounts, type CoachCount } from "./review";

const count = (over: Partial<CoachCount> = {}): CoachCount => ({
  statId: "st1",
  gameId: "g1",
  date: "2026-11-14",
  opponent: "Bandits",
  teamName: "Bombers",
  pitches: 55,
  strikes: 34,
  ...over,
});
const session = (over: Partial<PitchSession> = {}): PitchSession => ({
  id: "ps1",
  kind: "game",
  date: "2026-11-14",
  pitches: 52,
  strikes: null,
  gameId: null,
  statId: null,
  label: null,
  ...over,
});

describe("pendingCounts", () => {
  it("offers a new coach count", () => {
    const p = pendingCounts([count()], [], []);
    expect(p).toEqual([{ count: count(), reason: "new", existing: null }]);
  });

  it("hides one already approved", () => {
    expect(pendingCounts([count()], [session({ statId: "st1", pitches: 55 })], [])).toEqual([]);
  });

  it("brings it back when the coach changes the count", () => {
    const mine = session({ statId: "st1", pitches: 50 });
    const p = pendingCounts([count()], [mine], []);
    expect(p[0]).toMatchObject({ reason: "changed", existing: mine });
  });

  it("hides one the parent said no to, unless it changed", () => {
    expect(pendingCounts([count()], [], [{ statId: "st1", pitches: 55 }])).toEqual([]);
    expect(
      pendingCounts([count({ pitches: 60 })], [], [{ statId: "st1", pitches: 55 }]),
    ).toHaveLength(1);
  });

  it("knows when the parent already logged the game", () => {
    const mine = session({ gameId: "g1" });
    expect(pendingCounts([count()], [mine], [])[0]).toMatchObject({
      reason: "yours",
      existing: mine,
    });
    // Or a game that day, with no game picked.
    const sameDay = session();
    expect(pendingCounts([count()], [sameDay], [])[0]).toMatchObject({ reason: "yours" });
    // A bullpen that day isn't the game.
    expect(pendingCounts([count()], [session({ kind: "bullpen" })], [])[0]!.reason).toBe("new");
  });

  it("skips lines with no pitches, newest first", () => {
    const p = pendingCounts(
      [
        count({ statId: "a", date: "2026-11-01" }),
        count({ statId: "b", pitches: 0 }),
        count({ statId: "c", date: "2026-11-10" }),
      ],
      [],
      [],
    );
    expect(p.map((x) => x.count.statId)).toEqual(["c", "a"]);
  });
});
