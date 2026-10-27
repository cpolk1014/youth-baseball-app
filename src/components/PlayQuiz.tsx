"use client";

import { useState } from "react";
import { playById } from "@/lib/plays/library";
import type { QuizQuestion } from "@/lib/plays/quiz";
import { PlayAnimation, PlayField } from "./PlayField";

/**
 * Multiple-choice "where do I go?" quiz. Before answering, the field shows the start of the
 * play with the player ringed; after, the play runs so they can see the right job.
 */
export function PlayQuiz({
  questions,
  onFinish,
  onAgain,
}: {
  questions: QuizQuestion[];
  onFinish?: (correct: number, total: number) => void;
  onAgain?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const done = index >= questions.length;

  if (questions.length === 0) return <p className="text-lg">No plays to quiz on.</p>;

  if (done) {
    const pct = correct / questions.length;
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-5xl" aria-hidden="true">
          {pct === 1 ? "🏆" : pct >= 0.7 ? "⚾" : "💪"}
        </p>
        <p className="text-3xl font-bold">
          {correct} of {questions.length}
        </p>
        <p className="text-lg text-slate-700">
          {pct === 1
            ? "Perfect! You know where to go."
            : pct >= 0.7
              ? "Nice work. Watch the ones you missed and try again."
              : "Keep practicing. Watch the plays, then try again."}
        </p>
        {onAgain && (
          <button
            onClick={onAgain}
            className="h-14 w-full rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#152f55]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const q = questions[index]!;
  const play = playById(q.playId)!;
  const answered = picked !== null;
  const right = picked === q.answer;

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (i === q.answer) setCorrect((c) => c + 1);
  };
  const next = () => {
    const last = index + 1 >= questions.length;
    if (last) onFinish?.(correct, questions.length);
    setIndex(index + 1);
    setPicked(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-600">
          Question {index + 1} of {questions.length}
        </p>
        <p className="text-sm font-bold text-slate-600">{correct} right</p>
      </div>
      <div>
        <p className="text-base font-semibold text-slate-700">
          {play.name} · {play.situation}
        </p>
        <p className="text-xl leading-snug font-bold">{q.prompt}</p>
      </div>

      {answered ? (
        <PlayAnimation key={`${q.playId}-${index}`} play={play} focus={q.actor} autoPlay />
      ) : (
        <PlayField play={play} time={0} focus={q.actor} showPaths={false} />
      )}

      {answered && (
        <p
          role="status"
          className={`rounded-xl p-3 text-lg font-bold text-white ${right ? "bg-green-700" : "bg-red-700"}`}
        >
          {right ? "Right!" : "Not quite. Here's the job:"}{" "}
          <span className="font-normal">{q.choices[q.answer]}</span>
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {q.choices.map((c, i) => {
          const state = !answered
            ? "border-slate-300 bg-white active:bg-slate-100"
            : i === q.answer
              ? "border-green-700 bg-green-50"
              : i === picked
                ? "border-red-700 bg-red-50"
                : "border-slate-200 bg-white opacity-60";
          return (
            <li key={i}>
              <button
                onClick={() => choose(i)}
                disabled={answered}
                className={`min-h-14 w-full rounded-xl border-2 px-3 py-2 text-left text-base font-semibold ${state}`}
              >
                {c}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <button
          onClick={next}
          className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#152f55]"
        >
          {index + 1 >= questions.length ? "See my score" : "Next question"}
        </button>
      )}
    </div>
  );
}
