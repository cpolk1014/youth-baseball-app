"use client";

import { useState } from "react";
import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import { newId, saveAssignment, useAppData } from "@/lib/data/store";
import type { PlayAssignment } from "@/lib/data/types";
import { formatDue, homeworkStatus } from "@/lib/plays/homework";
import { PLAYS, playsIn } from "@/lib/plays/library";
import { PLAY_CATEGORIES } from "@/lib/plays/types";
import { AppShell, Loading } from "./AppShell";
import { AssignForm } from "./AssignForm";
import { QuizButton, firstNames } from "./QuizButton";
import { Sheet } from "./Sheet";

export function PlaysScreen() {
  const data = useAppData();
  const [assigning, setAssigning] = useState<PlayAssignment | null>(null);

  if (!data) {
    return (
      <AppShell title="Plays" tab="plays">
        <Loading />
      </AppShell>
    );
  }

  const canAssign = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const coachView = data.me.role === "coach" || data.me.role === "manager";
  const startAssign = () =>
    setAssigning({
      id: newId(),
      title: "",
      playIds: [],
      dueDate: null,
      createdAt: new Date().toISOString(),
    });

  return (
    <AppShell title="Plays" subtitle={`Where do I go? · ${PLAYS.length} plays`} tab="plays">
      <QuizButton
        plays={PLAYS}
        count={10}
        playerNames={firstNames(data.players)}
        className="mb-5 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-[#c8352e] text-xl font-bold text-white active:bg-[#a92a24]"
      >
        <span aria-hidden="true">⚾</span> Quiz me
      </QuizButton>

      {(data.assignments.length > 0 || canAssign) && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Homework
          </h2>
          {data.assignments.length === 0 && (
            <p className="mb-2 rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
              Assign a few plays for families to watch at home, then quiz on.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {data.assignments.map((a) => {
              const s = homeworkStatus(a, data.quizResults, data.members, data.me.userId);
              return (
                <li key={a.id}>
                  <Link
                    href={`/plays/homework/${a.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold">{a.title}</span>
                      <span className="block text-sm text-slate-600">
                        {a.playIds.length} {a.playIds.length === 1 ? "play" : "plays"}
                        {a.dueDate && ` · ${formatDue(a.dueDate)}`}
                      </span>
                    </span>
                    {coachView ? (
                      <span className="shrink-0 text-right text-sm font-bold whitespace-pre-line text-slate-700">
                        {s.families > 0
                          ? `${s.familiesDone} of ${s.families}\nfamilies`
                          : `${s.results.length} taken`}
                      </span>
                    ) : s.myBest ? (
                      <span className="shrink-0 rounded-lg bg-green-700 px-2 py-1 text-sm font-bold text-white">
                        ✓ {s.myBest.correct}/{s.myBest.total}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg bg-amber-300 px-2 py-1 text-sm font-bold">
                        To do
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {canAssign && (
            <button
              onClick={startAssign}
              className="mt-2 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
            >
              + Assign plays
            </button>
          )}
        </section>
      )}

      {PLAY_CATEGORIES.map((c) => (
        <section key={c} className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">{c}</h2>
          <ul className="flex flex-col gap-2">
            {playsIn(c).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/plays/${p.id}`}
                  className="flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-base leading-snug font-semibold">{p.name}</span>
                    <span className="block text-sm text-slate-600">{p.situation}</span>
                  </span>
                  <span aria-hidden="true" className="text-2xl text-slate-400">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={assigning !== null} title="Assign plays" onClose={() => setAssigning(null)}>
        {assigning && (
          <AssignForm
            assignment={assigning}
            onCancel={() => setAssigning(null)}
            onSave={(a) => {
              saveAssignment(a);
              setAssigning(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
