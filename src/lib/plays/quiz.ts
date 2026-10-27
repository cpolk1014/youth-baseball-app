import { shuffle } from "@/lib/rules/random";
import { actorsIn } from "./animate";
import { ACTOR_NAMES, FIELDERS, type Actor, type Fielder, type Play } from "./types";

export interface QuizQuestion {
  playId: string;
  actor: Actor;
  /** e.g. "Mason, you're playing Shortstop. Where do you go?" */
  prompt: string;
  choices: string[];
  /** Index of the right job in `choices`. */
  answer: number;
}

const CHOICES = 4;

/** Pick a random position on a play and ask for that player's job, with three wrong jobs. */
export function makeQuestion(
  play: Play,
  library: readonly Play[],
  rng: () => number,
  playerName?: string,
): QuizQuestion {
  // Fielders mostly; runners now and then, since kids run the bases too.
  const runners = actorsIn(play).filter((a) => !isFielder(a));
  const pool: Actor[] = rng() < 0.2 && runners.length ? runners : [...FIELDERS];
  const actor = pool[Math.floor(rng() * pool.length)]!;
  const right = play.jobs[actor]!;

  // Wrong answers: other players' jobs on this play first (the classic mix-up), then the
  // same position on other plays.
  const sameAsRight = (j: string) => j.trim().toLowerCase() === right.trim().toLowerCase();
  const wrong: string[] = [];
  const add = (j: string | undefined) => {
    if (j && !sameAsRight(j) && !wrong.some((w) => w === j)) wrong.push(j);
  };
  // Same kind of player first (a fielder's job vs. other fielders' jobs) so no choice is
  // an obvious giveaway.
  const others = actorsIn(play).filter((a) => a !== actor);
  const sameKind = others.filter((a) => isFielder(a) === isFielder(actor));
  const otherKind = others.filter((a) => isFielder(a) !== isFielder(actor));
  for (const a of [...shuffle(sameKind, rng), ...shuffle(otherKind, rng)]) add(play.jobs[a]);
  const picked = wrong.slice(0, CHOICES - 1);
  if (picked.length < CHOICES - 1) {
    for (const other of shuffle(library, rng)) {
      if (picked.length >= CHOICES - 1) break;
      const j = other.jobs[actor];
      if (j && !sameAsRight(j) && !picked.includes(j)) picked.push(j);
    }
  }

  const choices = shuffle([right, ...picked], rng);
  const role = ACTOR_NAMES[actor];
  const who = playerName ? `${playerName}, you're` : "You're";
  const prompt = isFielder(actor)
    ? `${who} playing ${role}. Where do you go?`
    : `${who} the ${role.toLowerCase()}. What do you do?`;
  return { playId: play.id, actor, prompt, choices, answer: choices.indexOf(right) };
}

/** A quiz of `count` questions drawn from `plays` (each play at most once while possible). */
export function makeQuiz(
  plays: readonly Play[],
  library: readonly Play[],
  count: number,
  rng: () => number,
  playerNames: readonly string[] = [],
): QuizQuestion[] {
  if (plays.length === 0) return [];
  const questions: QuizQuestion[] = [];
  let deck: Play[] = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) deck = shuffle(plays, rng);
    const play = deck.pop()!;
    const name = playerNames.length
      ? playerNames[Math.floor(rng() * playerNames.length)]
      : undefined;
    questions.push(makeQuestion(play, library, rng, name));
  }
  return questions;
}

export function isFielder(a: Actor): a is Fielder {
  return (FIELDERS as readonly string[]).includes(a);
}
