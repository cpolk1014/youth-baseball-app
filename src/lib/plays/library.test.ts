import { describe, expect, it } from "vitest";
import { actorsIn, keysFor, playDuration } from "./animate";
import { PLAYS, playById, playsFor, playsIn } from "./library";
import { PLAY_CATEGORIES, type Key } from "./types";

const sorted = (times: number[]) => times.every((t, i) => i === 0 || t >= times[i - 1]!);
const onField = ([, x, y]: Key) => x >= 0 && x <= 400 && y >= 0 && y <= 400;

describe("play library", () => {
  it("has at least 50 plays with unique ids, covering every category", () => {
    expect(PLAYS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(PLAYS.map((p) => p.id)).size).toBe(PLAYS.length);
    for (const c of PLAY_CATEGORIES) expect(playsIn(c).length, c).toBeGreaterThanOrEqual(4);
  });

  it("looks plays up by id", () => {
    expect(playById("steal-second")?.name).toBe("Steal of Second");
    expect(playsFor(["fly-left", "nope", "fly-center"]).map((p) => p.id)).toEqual([
      "fly-left",
      "fly-center",
    ]);
  });

  for (const play of PLAYS) {
    describe(play.id, () => {
      const actors = actorsIn(play);

      it("gives every player on the field a job, and nobody else", () => {
        for (const a of actors) expect(play.jobs[a], `${a} job`).toBeTruthy();
        for (const a of Object.keys(play.jobs)) expect(actors, `extra job ${a}`).toContain(a);
      });

      it("only moves players who are on the field", () => {
        for (const a of Object.keys(play.moves)) expect(actors, `moves ${a}`).toContain(a);
        for (const a of Object.keys(play.out ?? {})) expect(actors, `out ${a}`).toContain(a);
      });

      it("has keyframes in time order inside the field", () => {
        expect(play.ball.length).toBeGreaterThanOrEqual(2);
        expect(sorted(play.ball.map((k) => k[0])), "ball times").toBe(true);
        expect(play.ball.every(onField), "ball on field").toBe(true);
        for (const a of actors) {
          const keys = keysFor(play, a);
          expect(sorted(keys.map((k) => k[0])), `${a} times`).toBe(true);
          expect(keys.every(onField), `${a} on field`).toBe(true);
        }
      });

      it("tells the story in order, within the animation", () => {
        expect(play.steps.length).toBeGreaterThanOrEqual(2);
        const times = play.steps.map((s) => s[0]);
        expect(sorted(times)).toBe(true);
        expect(Math.max(...times)).toBeLessThan(playDuration(play));
        for (const t of Object.values(play.out ?? {})) expect(t).toBeLessThan(playDuration(play));
      });
    });
  }
});
