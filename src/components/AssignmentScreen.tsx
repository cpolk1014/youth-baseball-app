"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { permissionsFor } from "@/lib/data/permissions";
import { deleteAssignment, recordQuizResult, saveAssignment, useAppData } from "@/lib/data/store";
import { familiesNotDone, formatDue, homeworkStatus, quizLength } from "@/lib/plays/homework";
import { playsFor } from "@/lib/plays/library";
import { AppShell, Loading } from "./AppShell";
import { AssignForm } from "./AssignForm";
import { QuizButton, firstNames } from "./QuizButton";
import { Sheet } from "./Sheet";

export function AssignmentScreen({ assignmentId }: { assignmentId: string }) {
  const data = useAppData();
  const router = useRouter();
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const [kidId, setKidId] = useState("");

  if (!data) {
    return (
      <AppShell title="Homework" backHref="/plays" tab="plays">
        <Loading />
      </AppShell>
    );
  }
  const assignment = data.assignments.find((a) => a.id === assignmentId);
  if (!assignment) {
    return (
      <AppShell title="Homework not found" backHref="/plays" tab="plays">
        <p className="text-lg">This homework was removed.</p>
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const coachView = data.me.role === "coach" || data.me.role === "manager";
  const plays = playsFor(assignment.playIds);
  const status = homeworkStatus(assignment, data.quizResults, data.members, data.me.userId);
  const kids = data.players.filter((p) => p.active !== false);
  const kid = kids.find((p) => p.id === kidId);
  const nameOf = (userId: string) =>
    data.members.find((m) => m.userId === userId)?.displayName ?? "A parent";
  const kidName = (playerId: string | null) =>
    data.players.find((p) => p.id === playerId)?.name ?? null;

  return (
    <AppShell
      title={assignment.title}
      subtitle={assignment.dueDate ? formatDue(assignment.dueDate) : "Homework"}
      backHref="/plays"
      tab="plays"
    >
      <section className="mb-5 rounded-xl border-2 border-slate-200 bg-white p-4">
        <p className="text-base text-slate-700">
          Watch each play together, tap your player&apos;s position to see their job, then take the
          quiz.
        </p>
        {status.myBest && (
          <p className="mt-2 text-lg font-bold text-green-800">
            ✓ Done. Best score: {status.myBest.correct} of {status.myBest.total}
          </p>
        )}
        {kids.length > 0 && (
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-base font-semibold">Who&apos;s taking the quiz?</span>
            <select
              value={kidId}
              onChange={(e) => setKidId(e.target.value)}
              className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
            >
              <option value="">Pick a player</option>
              {kids.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <QuizButton
          plays={plays}
          count={quizLength(plays.length)}
          playerNames={kid ? firstNames([kid]) : undefined}
          title={assignment.title}
          onFinish={(correct, total) =>
            recordQuizResult({
              assignmentId: assignment.id,
              playerId: kid?.id ?? null,
              correct,
              total,
            })
          }
          className="mt-3 h-14 w-full rounded-xl bg-[#c8352e] text-lg font-bold text-white active:bg-[#a92a24] disabled:opacity-40"
        >
          {status.myBest ? "Take the quiz again" : "Take the quiz"}
        </QuizButton>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          Plays to watch
        </h2>
        <ol className="flex flex-col gap-2">
          {plays.map((p, i) => (
            <li key={p.id}>
              <Link
                href={`/plays/${p.id}`}
                className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
              >
                <span className="w-6 shrink-0 text-base font-bold text-slate-500">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug font-semibold">{p.name}</span>
                  <span className="block text-sm text-slate-600">{p.situation}</span>
                </span>
                <span aria-hidden="true" className="text-2xl text-slate-400">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {coachView && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Results
            {status.families > 0 && ` · ${status.familiesDone} of ${status.families} families`}
          </h2>
          {status.results.length === 0 ? (
            <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
              Nobody has taken the quiz yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-xl border-2 border-slate-200 bg-white p-2">
              {status.results.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-1 py-1 text-base">
                  <span className="min-w-0 flex-1 truncate">
                    <strong>{kidName(r.playerId) ?? nameOf(r.userId)}</strong>
                    {kidName(r.playerId) && (
                      <span className="text-slate-600"> · {nameOf(r.userId)}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-bold">
                    {r.correct}/{r.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {status.families > status.familiesDone && (
            <p className="mt-2 text-base text-slate-700">
              <strong>Not done yet:</strong>{" "}
              {familiesNotDone(status, data.members)
                .map((m) => m.displayName ?? "A parent")
                .join(", ")}
            </p>
          )}
        </section>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setPanel("edit")}
            className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
          >
            Edit homework
          </button>
          <button
            onClick={() => setPanel("delete")}
            className="h-12 text-base font-semibold text-red-700 underline"
          >
            Delete homework
          </button>
        </div>
      )}

      <Sheet open={panel === "edit"} title="Edit homework" onClose={() => setPanel(null)}>
        {panel === "edit" && (
          <AssignForm
            assignment={assignment}
            onCancel={() => setPanel(null)}
            onSave={(a) => {
              saveAssignment(a);
              setPanel(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={panel === "delete"} title="Delete this homework?" onClose={() => setPanel(null)}>
        <p className="mb-4 text-lg">
          &ldquo;{assignment.title}&rdquo; and everyone&apos;s quiz results on it will be removed.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPanel(null)}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Keep it
          </button>
          <button
            onClick={() => {
              deleteAssignment(assignment.id);
              router.push("/plays");
            }}
            className="h-14 rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
