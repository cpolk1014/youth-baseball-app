"use client";

import { useCallback, useState } from "react";
import { actorsIn, stepAt } from "@/lib/plays/animate";
import { isFielder } from "@/lib/plays/quiz";
import { ACTOR_NAMES, POSITION_NUMBER, type Actor, type Play } from "@/lib/plays/types";
import { PlayAnimation } from "./PlayField";

/** A play: the animated field, what happens step by step, and every player's job. */
export function PlayDetail({ play }: { play: Play }) {
  const [focus, setFocus] = useState<Actor | null>(null);
  const [time, setTime] = useState(0);
  const onTime = useCallback((t: number) => setTime(t), []);
  const current = stepAt(play, time);

  return (
    // Tablets and up: field on the left (stays in view), steps and jobs on the right.
    <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
      <div className="flex flex-col gap-4 md:sticky md:top-18">
        <div>
          <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">
            {play.category}
          </p>
          <h2 className="text-2xl leading-tight font-bold">{play.name}</h2>
          <p className="text-base text-slate-700">{play.situation}</p>
        </div>

        <PlayAnimation
          key={play.id}
          play={play}
          focus={focus}
          onSelect={setFocus}
          onTime={onTime}
        />

        <section
          className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4"
          aria-live="polite"
        >
          <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">Your job</p>
          {focus ? (
            <>
              <p className="text-xl font-bold">
                {ACTOR_NAMES[focus]}
                {isFielder(focus) && ` (${POSITION_NUMBER[focus]})`}
              </p>
              <p className="text-lg">{play.jobs[focus]}</p>
            </>
          ) : (
            <p className="text-lg">
              Tap a player on the field, or a position below, to follow them.
            </p>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section>
          <h3 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            What happens
          </h3>
          <ol className="flex flex-col gap-2">
            {play.steps.map(([, text], i) => (
              <li
                key={i}
                className={`flex gap-2 text-base ${i === current ? "font-semibold text-slate-900" : "text-slate-600"}`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    i === current ? "bg-[#c8352e] text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        {play.note && (
          <p className="border-l-4 border-amber-400 pl-3 text-base text-slate-700">{play.note}</p>
        )}

        <section>
          <h3 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Everyone on this play
          </h3>
          <ul className="flex flex-col gap-1">
            {actorsIn(play).map((a) => (
              <li key={a}>
                <button
                  onClick={() => setFocus(focus === a ? null : a)}
                  aria-pressed={focus === a}
                  className={`flex w-full items-start gap-3 rounded-xl p-2 text-left ${
                    focus === a ? "bg-amber-100 ring-2 ring-amber-400" : "active:bg-slate-100"
                  }`}
                >
                  <ActorBadge actor={a} />
                  <span className="min-w-0 text-base">
                    <strong className="block">{ACTOR_NAMES[a]}</strong>
                    {play.jobs[a]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function ActorBadge({ actor }: { actor: Actor }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
        isFielder(actor) ? "bg-[#1e3a6e]" : "bg-[#c8352e]"
      }`}
    >
      {actor}
    </span>
  );
}
