"use client";

import { useState } from "react";
import {
  gameLine,
  sameGame,
  type GameBatting,
  type GamePitching,
  type KidGame,
} from "@/lib/boxscore/stats";
import { matchBoxScore } from "@/lib/boxscore/match";
import { formatClock } from "@/lib/data/game";
import { useStoreState } from "@/lib/data/store";
import type { Game } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";

const MAX_BYTES = 4 * 1024 * 1024;

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
  | { status: "mismatch"; teams: string[]; ourTeam: string | null }
  | { status: "found"; teams: string[]; line: Found };

/**
 * A parent picks their kid's GameChanger box score; only their kid's line comes back
 * (found by jersey number on their team's side). It's matched to a game on the team's
 * schedule (or refused), and they confirm the game and that it's them before saving.
 */
export function ImportBoxScore({
  kid,
  existing = [],
  replacing = null,
  games,
  forGame = null,
  onSave,
  onCancel,
}: {
  kid: Player;
  /** The team's games; the box score has to be from one of them. */
  games: Game[];
  /** From a game's page: the box score has to be from this game. */
  forGame?: Game | null;
  /** The kid's box scores already imported, to warn before replacing one. */
  existing?: KidGame[];
  /** From a game's page: the box score already in for that game (replaced on save). */
  replacing?: KidGame | null;
  /** `replaces`: the earlier box score for the same game, which this one takes the place of. */
  onSave: (game: Omit<KidGame, "id">, replaces: KidGame | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { mode } = useStoreState();
  // Always the roster's number (coaches set it); the server uses the roster too.
  const number = kid.jerseyNumber == null ? "" : String(kid.jerseyNumber);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

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
      if (team) body.set("team", team);
      const res = await fetch("/api/boxscore/read", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the box score. Try again.");
      setAnswer(json);
      setPicked(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Which game on the schedule it's from: found, picked from a few, or none (not imported).
  const match =
    answer?.status === "found"
      ? matchBoxScore(
          {
            gameDate: answer.line.gameDate,
            opponent: answer.line.opponent,
            ourRuns: answer.line.ourRuns,
            theirRuns: answer.line.theirRuns,
          },
          games,
          forGame,
        )
      : null;
  const chosen =
    match?.kind === "one"
      ? match.game
      : match?.kind === "pick"
        ? (match.games.find((g) => g.id === picked) ?? null)
        : null;

  // An earlier box score for this game: saving replaces it.
  const earlier =
    replacing ??
    (chosen
      ? (existing.find(
          (g) =>
            g.playerId === kid.id &&
            (g.gameId === chosen.id ||
              (!g.gameId && sameGame(g, { gameDate: chosen.date, opponent: chosen.opponent }))),
        ) ?? null)
      : null);

  const save = async () => {
    if (answer?.status !== "found" || !chosen) return;
    const l = answer.line;
    setBusy("Saving…");
    setError(null);
    try {
      await onSave(
        {
          playerId: kid.id,
          gameId: chosen.id,
          gameDate: chosen.date,
          opponent: chosen.opponent,
          ourRuns: l.ourRuns,
          theirRuns: l.theirRuns,
          teamName: l.teamName,
          boxName: l.boxName,
          batting: l.batting,
          pitching: l.pitching,
          errors: l.errors,
          positions: l.positions,
        },
        earlier,
      );
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
    const ok = chosen !== null;
    if (match?.kind === "none") {
      return (
        <div className="flex flex-col gap-4">
          <p
            role="alert"
            className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base"
          >
            <b>Not imported.</b> {match.reason} Box scores are only saved for games on the
            team&apos;s schedule. If the game is missing, ask a coach to add it, then import again.
          </p>
          <button
            onClick={() => setAnswer(null)}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white"
          >
            Choose a different box score
          </button>
          <button
            onClick={onCancel}
            className="h-12 text-base font-semibold text-slate-700 underline"
          >
            Cancel
          </button>
        </div>
      );
    }
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
        {match?.kind === "one" && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
            <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">The game</p>
            <p className="text-lg font-bold">{gameText(match.game)}</p>
          </div>
        )}
        {match?.kind === "pick" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-semibold">
              Which game is this box score from?
            </legend>
            {match.games.map((g) => (
              <label
                key={g.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-3 py-2 ${picked === g.id ? "border-[var(--team)]" : "border-slate-200"}`}
              >
                <input
                  type="radio"
                  name="box-game"
                  checked={picked === g.id}
                  onChange={() => setPicked(g.id)}
                  className="size-5 shrink-0 accent-[var(--team)]"
                />
                <span className="text-base font-semibold">{gameText(g)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {earlier && (
          <p
            role="alert"
            className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base leading-snug text-amber-950"
          >
            <b>You already imported this game</b> (vs {earlier.opponent}: {gameLine(earlier)}).
            Saving replaces it with this one.
          </p>
        )}
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
            {busy ?? (earlier ? "Yes, replace it" : "Yes, save this game")}
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
      {number ? (
        <p className="rounded-xl bg-slate-100 p-3 text-base">
          Looking for <strong>#{number}</strong> (from the roster). If {kid.name} wears a different
          number in GameChanger, ask a coach to update the roster.
        </p>
      ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
          {kid.name} doesn&apos;t have a jersey number on the roster yet. Ask a coach to add it,
          then import.
        </p>
      )}
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
      {answer?.status === "mismatch" && (
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
          The player wearing #{number} on {answer.ourTeam ?? "your team"} in this box score has a
          different name than {kid.name}, so it wasn&apos;t imported. If {kid.name} changed numbers,
          ask a coach to update the roster.
        </p>
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

/** "Sun, Feb 15 · 6:30 PM · vs LBC Rudy" (and the score once it's final). */
function gameText(g: Game): string {
  return [
    new Date(`${g.date}T12:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    g.startTime ? formatClock(g.startTime) : null,
    `vs ${g.opponent}`,
    g.status === "final" && g.scoreUs != null && g.scoreThem != null
      ? `${g.scoreUs}–${g.scoreThem}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
