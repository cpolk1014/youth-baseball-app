import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/rules/random";
import { PLAYS } from "./library";
import { makeQuestion, makeQuiz } from "./quiz";

describe("quiz", () => {
  it("asks for one player's job with four different choices, one of them right", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const play = PLAYS[seed % PLAYS.length]!;
      const q = makeQuestion(play, PLAYS, rng);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.toLowerCase())).size).toBe(4);
      expect(q.choices[q.answer]).toBe(play.jobs[q.actor]);
    }
  });

  it("names the player when given one", () => {
    const q = makeQuestion(PLAYS[0]!, PLAYS, createRng(3), "Mason");
    expect(q.prompt).toMatch(/^Mason, you're /);
  });

  it("is the same quiz for the same seed", () => {
    const a = makeQuiz(PLAYS, PLAYS, 10, createRng(42), ["Ava", "Leo"]);
    const b = makeQuiz(PLAYS, PLAYS, 10, createRng(42), ["Ava", "Leo"]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
  });

  it("uses each play once before repeating", () => {
    const plays = PLAYS.slice(0, 3);
    const q = makeQuiz(plays, PLAYS, 6, createRng(7));
    expect(new Set(q.slice(0, 3).map((x) => x.playId)).size).toBe(3);
    expect(makeQuiz([], PLAYS, 5, createRng(1))).toEqual([]);
  });
});
