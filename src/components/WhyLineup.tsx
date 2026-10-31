"use client";

import { useState } from "react";
import type { LineupExplanation } from "@/lib/rules/explain";

/** "Why this lineup?": rules followed, trade-offs, and a line per kid you can open. */
export function WhyLineup({ explanation }: { explanation: LineupExplanation }) {
  const [open, setOpen] = useState(false);
  const [kid, setKid] = useState<string | null>(null);

  return (
    <section className="mt-3 rounded-xl border-2 border-slate-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between px-4 text-left text-lg font-bold"
      >
        Why this lineup?
        <span aria-hidden="true" className="text-xl text-slate-500">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t-2 border-slate-100 px-4 pt-3 pb-4">
          {explanation.intro && (
            <div className="flex flex-col gap-2 rounded-lg bg-slate-100 p-3 text-base">
              {explanation.intro.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          )}
          {explanation.followed.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
                Rules it follows
              </h3>
              <ul className="text-base">
                {explanation.followed.map((r) => (
                  <li key={r}>✓ {r}</li>
                ))}
              </ul>
            </div>
          )}
          {explanation.tradeoffs.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
                Trade-offs
              </h3>
              <ul className="text-base text-amber-950">
                {explanation.tradeoffs.map((t, i) => (
                  <li key={i}>⚠ {t}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
              Each player
            </h3>
            <ul className="flex flex-col gap-1">
              {explanation.players.map((p) => (
                <li key={p.playerId}>
                  <button
                    onClick={() => setKid(kid === p.playerId ? null : p.playerId)}
                    aria-expanded={kid === p.playerId}
                    className="w-full rounded-lg px-2 py-2 text-left active:bg-slate-100"
                  >
                    <span className="block text-base font-semibold">{p.name}</span>
                    <span className="block text-sm text-slate-600">{p.summary}</span>
                  </button>
                  {kid === p.playerId && (
                    <ul className="mb-2 ml-4 list-disc pl-4 text-base">
                      {p.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {explanation.absent.length > 0 && (
              <p className="mt-2 text-base text-slate-600">
                Not here: {explanation.absent.join(", ")}
              </p>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {explanation.intro
              ? "Where two kids' stats were about even, auto-fill picked one. Those can be swapped without breaking any Must rule."
              : "Where two choices were equally fair (like who plays 2B vs. SS in an inning), auto-fill picked one. Those can be swapped without breaking any rule."}
          </p>
        </div>
      )}
    </section>
  );
}
