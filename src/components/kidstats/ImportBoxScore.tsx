"use client";

import { useState } from "react";
import { gameLine, type GameBatting, type GamePitching, type KidGame } from "@/lib/boxscore/stats";
import { useStoreState } from "@/lib/data/store";
import type { Player } from "@/lib/rules/types";

const MAX_BYTES = 4 * 1024 * 1024;
const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";

interface Found {
  teamName: string;
  opponent: string | null;
  gameDate: string | null;
  ourRuns: number | null;
  theirRuns: number | null;
  boxName: string | null;
  boxNumber: string | null;
  matchedBy: "number" | "name";
  batting: GameBatting;
  pitching: GamePitching | null;
  errors: number;
  positions: string[];
}

type Answer =
  | { status: "pick_team"; teams: string[] }
  | { status: "not_found"; teams: string[]; ourTeam: string | null }
  | { status: "found"; teams: string[]; line: Found };

/**
 * A parent picks their kid's GameChanger box score; only their kid's line comes back
 * (found by jersey number on their team's side), and they confirm it's them before saving.
 */
export function ImportBoxScore({
  kid,
  onSave,
  onCancel,
}: {
  kid: Player;
  onSave: (game: Omit<KidGame, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const { mode } = useStoreState();
  const [number, setNumber] = useState(kid.jerseyNumber == null ? "" : String(kid.jerseyNumber));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");

  const read = async (f: File, team?: string) => {
    setError(null);
    if (f.size > MAX_BYTES) {
      setError("That file is too big. Try one under 4 MB.");
      return;
    }
    if (mode !== "supabase") {
      setError("Importing a box score needs you to be signed in.");
      return;
    }
    setBusy(`Finding #${number} in the box score…`);
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("playerId", kid.id);
      body.set("number", number);
      if (team) body.set("team", team);
      const res = await fetch("/api/boxscore/read", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the box score. Try again.");
      setAnswer(json);
      if (json.status === "found") {
        setDate(json.line.gameDate ?? "");
        setOpponent(json.line.opponent ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (answer?.status !== "found") return;
    const l = answer.line;
    setBusy("Saving…");
    setError(null);
    try {
      await onSave({
        playerId: kid.id,
        gameDate: date,
        opponent: opponent.trim(),
        ourRuns: l.ourRuns,
        theirRuns: l.theirRuns,
        teamName: l.teamName,
        boxName: l.boxName,
        batting: l.batting,
        pitching: l.pitching,
        errors: l.errors,
        positions: l.positions,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const teamButtons = (teams: string[], label: string) => (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold">{label}</p>
      {teams.map((t) => (
        <button
          key={t}
          onClick={() => file && void read(file, t)}
          disabled={busy !== null}
          className="min-h-14 rounded-xl border-2 border-slate-300 bg-white px-3 text-left text-lg font-bold active:bg-slate-50"
        >
          {t}
        </button>
      ))}
    </div>
  );

  // Step 3: confirm it's them.
  if (answer?.status === "found") {
    const l = answer.line;
    const result =
      l.ourRuns !== null && l.theirRuns !== null
        ? `${l.ourRuns > l.theirRuns ? "W" : l.ourRuns < l.theirRuns ? "L" : "T"} ${l.ourRuns}–${l.theirRuns}`
        : null;
    const preview = {
      batting: l.batting,
      pitching: l.pitching,
    } as KidGame;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && opponent.trim().length > 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-[var(--team)] bg-white p-3">
          <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">
            Is this {kid.name}?
          </p>
          <p className="text-2xl font-black">
            {l.boxNumber ? `#${l.boxNumber} ` : ""}
            {l.boxName ?? "Unnamed"}
          </p>
          <p className="text-base text-slate-700">{l.teamName}</p>
          {l.matchedBy === "name" && (
            <p className="mt-1 text-sm font-semibold text-amber-800">
              The box score doesn&apos;t show numbers, so this was matched by name. Check it.
            </p>
          )}
        </div>
        <div className="rounded-xl bg-slate-100 p-3 text-base">
          <p className="font-bold">{gameLine(preview)}</p>
          {l.positions.length > 0 && <p>Played {l.positions.join(", ")}</p>}
          {l.errors > 0 && (
            <p>
              {l.errors} error{l.errors === 1 ? "" : "s"}
            </p>
          )}
          {result && <p>Team result: {result}</p>}
        </div>
        <div className="flex gap-3">
          <label className="flex flex-[3] flex-col gap-1">
            <span className="text-base font-semibold">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-[4] flex-col gap-1">
            <span className="text-base font-semibold">Opponent</span>
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              maxLength={80}
              className={field}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setAnswer(null)}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold text-slate-800 active:bg-slate-100"
          >
            Not them
          </button>
          <button
            onClick={() => void save()}
            disabled={!ok || busy !== null}
            className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
          >
            {busy ?? "Yes, save this game"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        In GameChanger, open the game and share or download its box score PDF. RallyCap reads only{" "}
        {kid.name}&apos;s line from it. Nothing about other players is kept, and only you (and{" "}
        {kid.name}&apos;s other linked parents) can see it.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Jersey number in GameChanger</span>
        <input
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="45"
          className={field}
        />
      </label>
      <label
        className={`flex h-14 cursor-pointer items-center justify-center rounded-xl text-lg font-bold ${
          number ? "bg-[var(--team)] text-white" : "bg-slate-300 text-slate-600"
        }`}
      >
        {busy ?? (file ? "Choose a different box score" : "Choose the box score")}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          disabled={!number || busy !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setFile(f);
            setAnswer(null);
            void read(f);
          }}
        />
      </label>

      {answer?.status === "pick_team" &&
        teamButtons(answer.teams, `Which team is ${kid.name} on in this box score?`)}
      {answer?.status === "not_found" && (
        <>
          <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
            #{number} isn&apos;t on {answer.ourTeam ?? "your team"} in this box score. Check the
            jersey number, or pick the right team.
          </p>
          {answer.teams.length > 0 && teamButtons(answer.teams, "Their team in this box score:")}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button onClick={onCancel} className="h-12 text-base font-semibold text-slate-700 underline">
        Cancel
      </button>
    </div>
  );
}
