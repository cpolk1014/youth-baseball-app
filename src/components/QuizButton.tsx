"use client";

import { useMemo, useState, type ReactNode } from "react";
import { myUserId } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { PLAYS } from "@/lib/plays/library";
import { makeQuiz } from "@/lib/plays/quiz";
import type { Play } from "@/lib/plays/types";
import { createRng } from "@/lib/rules/random";
import { kidsOf } from "./KidPicker";
import { PlayQuiz } from "./PlayQuiz";
import { Sheet } from "./Sheet";

/** A button that opens a fresh random quiz on some plays in a sheet. */
export function QuizButton({
  plays,
  count,
  playerNames,
  title = "Where do I go?",
  className,
  onFinish,
  children,
}: {
  plays: readonly Play[];
  count: number;
  /** Kids' first names to put in the questions. */
  playerNames?: string[];
  title?: string;
  className: string;
  onFinish?: (correct: number, total: number) => void;
  children: ReactNode;
}) {
  // A new seed for each quiz; null while closed.
  const [seed, setSeed] = useState<number | null>(null);
  const questions = useMemo(
    () => (seed === null ? [] : makeQuiz(plays, PLAYS, count, createRng(seed), playerNames)),
    [seed, plays, count, playerNames],
  );
  return (
    <>
      <button
        onClick={() => setSeed(Date.now())}
        disabled={plays.length === 0}
        className={className}
      >
        {children}
      </button>
      <Sheet open={seed !== null} title={title} onClose={() => setSeed(null)}>
        {seed !== null && (
          <PlayQuiz
            key={seed}
            questions={questions}
            onFinish={onFinish}
            onAgain={() => setSeed(Date.now())}
          />
        )}
      </Sheet>
    </>
  );
}

/** Names for quiz questions: a parent's own kids, else the whole roster (coaches). */
export function quizNames(data: AppData): string[] {
  const mine = kidsOf(data, myUserId(data));
  return firstNames(mine.length > 0 ? mine : data.players);
}

/** First names of active players, for friendlier quiz questions. */
export function firstNames(players: { name: string; active?: boolean }[]): string[] {
  return players
    .filter((p) => p.active !== false)
    .map((p) => p.name.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}
