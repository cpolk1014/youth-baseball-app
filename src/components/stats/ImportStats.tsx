"use client";

import { useState } from "react";
import type { AppData } from "@/lib/data/types";
import { activePlayers } from "@/lib/lineup/edit";
import { matchRoster, parseGameChangerStats, type TeamStats } from "@/lib/stats/gamechanger";

const MAX_FILE_BYTES = 2_000_000;

/** Pick GameChanger's CSV, check who's who against the roster, then replace the stats. */
export function ImportStats({
  data,
  replacing,
  onCancel,
  onImport,
}: {
  data: AppData;
  /** When the stats being replaced were imported; null for a first import. */
  replacing: string | null;
  onCancel: () => void;
  onImport: (fileName: string, stats: TeamStats) => Promise<void>;
}) {
  const [file, setFile] = useState<{ name: string; stats: TeamStats } | null>(null);
  const [matches, setMatches] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roster = [...data.players].sort(
    (a, b) => Number(b.active !== false) - Number(a.active !== false),
  );
  const activeIds = new Set(activePlayers(data.players).map((p) => p.id));

  const read = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    try {
      if (f.size > MAX_FILE_BYTES) throw new Error("That file is too big for a stats export.");
      const stats = parseGameChangerStats(await f.text());
      setFile({ name: f.name, stats });
      setMatches(matchRoster(stats.players, data.players));
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const picked = matches.filter((m): m is string => m !== null);
  const doubled = picked.length !== new Set(picked).size;
  const unmatched = matches.filter((m) => m === null).length;

  const save = async () => {
    if (!file || doubled) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(file.name, {
        ...file.stats,
        players: file.stats.players.map((p, i) => ({ ...p, playerId: matches[i] ?? null })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Use GameChanger&apos;s team stats export (a .csv file with Batting, Pitching and Fielding).{" "}
        {replacing
          ? `This replaces the stats imported ${replacing}.`
          : "Each import replaces the last one."}
      </p>

      <label className="flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-400 bg-white text-lg font-bold text-slate-800 active:bg-slate-100">
        {file ? "Choose a different file" : "Choose the CSV file"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {file && (
        <section>
          <p className="mb-1 text-base font-semibold">
            {file.stats.players.length} players in {file.name}
          </p>
          <p className="mb-2 text-sm text-slate-600">
            Check each one is the right kid on your roster.
          </p>
          <ul className="flex flex-col gap-2">
            {file.stats.players.map((p, i) => (
              <li
                key={i}
                className={`flex flex-col gap-1 rounded-xl border-2 p-2 ${
                  matches[i] ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"
                }`}
              >
                <span className="text-base">
                  <span className="text-slate-500">#{p.number || "–"}</span>{" "}
                  <strong>
                    {p.first} {p.last}
                  </strong>
                </span>
                <select
                  aria-label={`Roster match for ${p.first} ${p.last}`}
                  value={matches[i] ?? ""}
                  onChange={(e) =>
                    setMatches(matches.map((m, j) => (j === i ? e.target.value || null : m)))
                  }
                  className="h-12 rounded-lg border-2 border-slate-300 bg-white px-2 text-base"
                >
                  <option value="">Not on our roster</option>
                  {roster.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.jerseyNumber != null ? ` #${r.jerseyNumber}` : ""}
                      {activeIds.has(r.id) ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {unmatched > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              {unmatched} not on the roster: their stats still show, under GameChanger&apos;s name.
            </p>
          )}
          {doubled && (
            <p role="alert" className="mt-2 text-base font-semibold text-red-700">
              Two players are matched to the same kid. Fix one before importing.
            </p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold text-slate-800 active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={!file || doubled || busy}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : replacing ? "Replace stats" : "Import stats"}
        </button>
      </div>
    </div>
  );
}
