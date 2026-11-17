"use client";

import { useState } from "react";
import { newId, savePlayer } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import {
  buildRosterReview,
  rowToPlayer,
  type ReadPlayer,
  type RosterReviewRow,
} from "@/lib/roster-import/review";
import { prepareFile } from "./ImportSchedule";

type Step =
  | { kind: "pick" }
  | { kind: "reading"; fileName: string }
  | { kind: "review"; rows: RosterReviewRow[]; warnings: string[] }
  | { kind: "done"; added: number; updated: number };

/**
 * Build the roster from a file: a screenshot, photo, PDF or CSV. Claude reads names, jersey
 * numbers, positions and who pitches or catches (nothing else about the kids), and the coach
 * checks the list before anyone is added.
 */
export function ImportRoster({ data, onClose }: { data: AppData; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    setStep({ kind: "reading", fileName: file.name });
    try {
      const body = new FormData();
      body.append("file", await prepareFile(file));
      body.append("teamId", data.team.id);
      const res = await fetch("/api/roster-import", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        players?: ReadPlayer[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read that file. Try again.");
      const players = json.players ?? [];
      if (players.length === 0) {
        throw new Error(json.warnings?.[0] ?? "No players found in that file.");
      }
      setStep({
        kind: "review",
        rows: buildRosterReview(players, data.players),
        warnings: json.warnings ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: "pick" });
    }
  };

  if (step.kind === "reading") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">Reading {step.fileName}…</p>
        <p className="text-base text-slate-600">This can take up to a minute.</p>
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white" role="status">
          {[
            step.added ? `Added ${step.added} player${step.added === 1 ? "" : "s"}` : null,
            step.updated ? `updated ${step.updated}` : null,
          ]
            .filter(Boolean)
            .join(" and ")}
          .
        </p>
        <p className="text-base text-slate-700">
          Tap any player to fix their name or number, or set who can pitch and catch.
        </p>
        <button
          onClick={onClose}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  if (step.kind === "review") {
    return (
      <RosterReview
        rows={step.rows}
        warnings={step.warnings}
        onBack={() => setStep({ kind: "pick" })}
        onDone={(added, updated) => setStep({ kind: "done", added, updated })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Upload your roster: a screenshot (GameChanger, the league site, a text), a photo of a
        printed list, a PDF, or a CSV. We&apos;ll find each player&apos;s name, number and positions
        and show them to you before anyone is added.
      </p>
      <label className="flex h-16 cursor-pointer items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]">
        Choose a file
        <input
          type="file"
          accept="image/*,application/pdf,.pdf,.csv,text/csv,.tsv,.txt"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void read(file);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Your file is sent to Claude (Anthropic&apos;s AI) to read it, and isn&apos;t kept. Only
        names, numbers and positions come back: never birthdays, contact details or parents&apos;
        names, even if the file has them.
      </p>
    </div>
  );
}

export function RosterReview({
  rows: initial,
  warnings,
  onBack,
  onDone,
}: {
  rows: RosterReviewRow[];
  warnings: string[];
  onBack: () => void;
  onDone: (added: number, updated: number) => void;
}) {
  const [rows, setRows] = useState(initial);
  const picked = rows.filter((r) => r.checked && r.read.name.trim());
  const set = (i: number, change: Partial<RosterReviewRow> | Partial<ReadPlayer>) =>
    setRows(
      rows.map((r, j) =>
        j !== i
          ? r
          : "checked" in change
            ? { ...r, ...(change as Partial<RosterReviewRow>) }
            : { ...r, read: { ...r.read, ...(change as Partial<ReadPlayer>) } },
      ),
    );

  const add = () => {
    for (const row of picked) {
      savePlayer(rowToPlayer({ ...row, read: { ...row.read, name: row.read.name.trim() } }, newId));
    }
    onDone(picked.filter((r) => !r.existing).length, picked.filter((r) => r.existing).length);
  };

  return (
    <div className="flex flex-col gap-3">
      {warnings.map((w) => (
        <p key={w} className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
          {w}
        </p>
      ))}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">
          Players ({picked.length} of {rows.length})
        </p>
        <button
          onClick={() =>
            setRows(rows.map((r) => ({ ...r, checked: picked.length !== rows.length })))
          }
          className="h-10 px-2 text-sm font-semibold underline"
        >
          {picked.length === rows.length ? "Uncheck all" : "Check all"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const r = row.read;
          return (
            <li
              key={i}
              className={`rounded-xl border-2 bg-white p-3 ${row.checked ? "border-[var(--team)]" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Add ${r.name}`}
                  checked={row.checked}
                  onChange={(e) => set(i, { checked: e.target.checked })}
                  className="size-6 shrink-0 accent-[var(--team)]"
                />
                <input
                  aria-label="Number"
                  inputMode="numeric"
                  value={r.jerseyNumber ?? ""}
                  placeholder="#"
                  onChange={(e) => {
                    const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                    set(i, { jerseyNumber: d === "" ? null : Number(d) });
                  }}
                  className="h-11 w-14 shrink-0 rounded-lg border-2 border-slate-300 bg-white text-center text-lg font-bold tabular-nums"
                />
                <input
                  aria-label="Name"
                  value={r.name}
                  maxLength={60}
                  onChange={(e) => set(i, { name: e.target.value })}
                  className="h-11 min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-2 text-base font-semibold"
                />
              </div>
              {(r.positions.length > 0 || r.canPitch || r.canCatch) && (
                <p className="mt-1 pl-8 text-sm text-slate-600">
                  {[
                    r.positions.length ? r.positions.join(", ") : null,
                    r.canPitch ? "pitches" : null,
                    r.canCatch ? "catches" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {row.existing && (
                <p className="mt-1 pl-8 text-sm text-slate-700">
                  Already on the roster as <b>{row.existing.name}</b>
                  {r.jerseyNumber !== null && r.jerseyNumber !== (row.existing.jerseyNumber ?? null)
                    ? ` (#${row.existing.jerseyNumber ?? "–"} → #${r.jerseyNumber})`
                    : ""}
                  . Check it to update them.
                </p>
              )}
              {row.numberTakenBy && r.jerseyNumber === row.numberTakenBy.jerseyNumber && (
                <p className="mt-1 pl-8 text-sm font-semibold text-amber-800">
                  #{r.jerseyNumber} is {row.numberTakenBy.name}&apos;s number.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onBack}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Back
        </button>
        <button
          onClick={add}
          disabled={picked.length === 0}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
        >
          Add {picked.length} player{picked.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
