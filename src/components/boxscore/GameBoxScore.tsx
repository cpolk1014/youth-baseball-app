"use client";

import { useState } from "react";
import {
  gameLine,
  outsToInnings,
  sameGame,
  type GameBatting,
  type GamePitching,
  type KidGame,
} from "@/lib/boxscore/stats";
import { useStoreState } from "@/lib/data/store";
import type { Game } from "@/lib/data/types";
import type { Lineup, Player } from "@/lib/rules/types";
import { usePlan } from "../paywall";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";
import type { CountToSave, LineToSave, useSeasonBoxScores } from "./boxData";

const heading = "text-sm font-bold tracking-wide text-slate-600 uppercase";
const MAX_BYTES = 4 * 1024 * 1024;

type Box = ReturnType<typeof useSeasonBoxScores>;

const pitchText = (p: GamePitching | null) =>
  p && p.pitches > 0 ? `${p.pitches}${p.strikes > 0 ? ` (${p.strikes} strikes)` : ""}` : null;

/**
 * A game's box score and pitch counts, for coaches and managers: upload GameChanger's box
 * score (AI reads every kid's line; paid) or type each pitcher's count (free). Parents see
 * their own kid's line and get the pitch count to approve.
 */
export function GameBoxScore({
  game,
  players,
  lineup,
  box,
}: {
  game: Game;
  players: Player[];
  lineup: Lineup;
  box: Box;
}) {
  const { paid } = usePlan();
  const [uploading, setUploading] = useState(false);
  const [typing, setTyping] = useState(false);
  const mine = box.lines.filter((l) => l.gameId === game.id);
  const full = mine.filter((l) => !l.pitchOnly);
  const pitchers = mine.filter((l) => (l.pitching?.pitches ?? 0) > 0);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "Someone";
  const btn = "h-12 flex-1 rounded-xl border-2 border-[var(--team)] px-3 text-base font-bold";
  const plain = `${btn} bg-white text-[var(--team)] active:bg-slate-100`;
  const main = `${btn} bg-[var(--team)] text-white active:bg-[var(--team-press)]`;

  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      <h2 className={`${heading} mb-2`}>Box score &amp; pitch counts</h2>
      {box.loading ? (
        <p className="text-base text-slate-600">Loading…</p>
      ) : (
        <>
          {full.length > 0 ? (
            <p className="text-base font-semibold text-green-800">
              ✓ Box score in · {full.length} player{full.length === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-base text-slate-700">
              Add GameChanger&apos;s box score after the game: everyone&apos;s stats and pitch
              counts in one upload. It powers competitive lineups and hot streaks, and each family
              sees their own kid&apos;s line.
            </p>
          )}
          {pitchers.length > 0 && (
            <p className="mt-1 text-base">
              <b>Pitches:</b>{" "}
              {pitchers.map((l) => `${name(l.playerId)} ${pitchText(l.pitching)}`).join(" · ")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setUploading(true)} className={full.length ? plain : main}>
              {paid ? "" : "🔒 "}
              {full.length ? "Replace box score" : "Add box score"}
            </button>
            <button onClick={() => setTyping(true)} className={plain}>
              {pitchers.length ? "Edit pitch counts" : "Type pitch counts"}
            </button>
          </div>
          {mine.length > 0 && (
            <button
              onClick={() => {
                if (!window.confirm("Remove this game's box score and pitch counts?")) return;
                void box.clear(game.id).then(
                  () => toast("Box score removed"),
                  (e: unknown) => toast(e instanceof Error ? e.message : String(e)),
                );
              }}
              className="mt-2 h-10 text-sm font-semibold text-red-700 underline"
            >
              Remove
            </button>
          )}
        </>
      )}

      <Sheet open={uploading} title="Add the box score" onClose={() => setUploading(false)}>
        {uploading &&
          (paid ? (
            <UploadBoxScore
              game={game}
              players={players}
              onCancel={() => setUploading(false)}
              onSave={async (lines) => {
                await box.save(game, lines);
                setUploading(false);
                toast("Box score saved");
              }}
            />
          ) : (
            <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base">
              🔒 Reading box scores with AI is a paid feature. Typing pitch counts by hand is free.
            </p>
          ))}
      </Sheet>

      <Sheet open={typing} title="Pitch counts" onClose={() => setTyping(false)}>
        {typing && (
          <PitchCountForm
            players={players}
            lineup={lineup}
            existing={mine}
            onCancel={() => setTyping(false)}
            onSave={async (counts) => {
              await box.savePitches(game, counts);
              setTyping(false);
              toast("Pitch counts saved");
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

interface ReadLine {
  boxName: string | null;
  boxNumber: string | null;
  playerId: string | null;
  matchedBy: "number" | "name" | null;
  batting: GameBatting;
  pitching: GamePitching | null;
  errors: number;
  positions: string[];
}

type Answer =
  | { status: "pick_team"; teams: string[] }
  | {
      status: "found";
      teams: string[];
      ourTeam: string;
      opponent: string | null;
      gameDate: string | null;
      ourRuns: number | null;
      theirRuns: number | null;
      lines: ReadLine[];
    };

function UploadBoxScore({
  game,
  players,
  onSave,
  onCancel,
}: {
  game: Game;
  players: Player[];
  onSave: (lines: LineToSave[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { mode } = useStoreState();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Who each line is (the coach can fix a match or skip a line).
  const [who, setWho] = useState<(string | null)[]>([]);

  const read = async (f: File, team?: string) => {
    setError(null);
    if (f.size > MAX_BYTES) return setError("That file is too big. Try one under 4 MB.");
    if (mode !== "supabase") return setError("Reading a box score needs you to be signed in.");
    setBusy("Reading the box score… (about a minute)");
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("gameId", game.id);
      if (team) body.set("team", team);
      const res = await fetch("/api/boxscore/read", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the box score. Try again.");
      setAnswer(json);
      if (json.status === "found") setWho(json.lines.map((l) => l.playerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (busy) return <p className="rounded-xl bg-slate-100 p-4 text-base font-semibold">{busy}</p>;

  if (!answer || !file) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base">
          In GameChanger, open the game, then <b>Box Score</b> and export the PDF (or take a
          screenshot). RallyCap reads every player on your team. The file isn&apos;t kept.
        </p>
        <label className="flex h-14 cursor-pointer items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]">
          Choose the box score
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFile(f);
              void read(f);
            }}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
            {error}
          </p>
        )}
        <button onClick={onCancel} className="h-12 text-base font-semibold underline">
          Cancel
        </button>
      </div>
    );
  }

  if (answer.status === "pick_team") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold">Which team is yours in this box score?</p>
        {answer.teams.map((t) => (
          <button
            key={t}
            onClick={() => void read(file, t)}
            className="h-12 rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100"
          >
            {t}
          </button>
        ))}
        <button onClick={onCancel} className="h-12 text-base font-semibold underline">
          Cancel
        </button>
      </div>
    );
  }

  const otherGame =
    answer.gameDate && answer.opponent
      ? !sameGame(
          { gameDate: answer.gameDate, opponent: answer.opponent },
          { gameDate: game.date, opponent: game.opponent },
        )
      : false;
  const chosen = new Set(who.filter(Boolean));
  const keep = answer.lines.flatMap((l, i) => (who[i] ? [{ ...l, playerId: who[i]! }] : []));
  const unmatched = answer.lines.filter((_, i) => !who[i]).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base">
        <b>{answer.ourTeam}</b>
        {answer.opponent ? ` vs ${answer.opponent}` : ""}
        {answer.ourRuns !== null && answer.theirRuns !== null
          ? ` · ${answer.ourRuns}–${answer.theirRuns}`
          : ""}
      </p>
      {otherGame && (
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
          Heads up: this box score looks like {answer.gameDate} vs {answer.opponent}, not this game
          ({game.date} vs {game.opponent}). Check it&apos;s the right one before saving.
        </p>
      )}
      {unmatched > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
          {unmatched} line{unmatched === 1 ? "" : "s"} didn&apos;t match the roster. Pick who it is,
          or leave it skipped.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {answer.lines.map((l, i) => (
          <li
            key={i}
            className={`rounded-xl border-2 p-3 ${who[i] ? "border-slate-200" : "border-amber-400"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-bold">
                {l.boxName}
                {l.boxNumber ? ` #${l.boxNumber}` : ""}
              </span>
              <select
                aria-label={`Who is ${l.boxName}`}
                value={who[i] ?? ""}
                onChange={(e) => {
                  const next = [...who];
                  next[i] = e.target.value || null;
                  setWho(next);
                }}
                className="h-11 max-w-full rounded-lg border-2 border-slate-300 bg-white px-2 text-base"
              >
                <option value="">Skip this line</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id} disabled={chosen.has(p.id) && who[i] !== p.id}>
                    {p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-700">
              {gameLine({ batting: l.batting, pitching: l.pitching } as KidGame)}
              {l.pitching && l.pitching.pitches > 0
                ? ` · ${l.pitching.pitches} pitches`
                : l.pitching
                  ? ` · ${outsToInnings(l.pitching.outs)} IP, no pitch count`
                  : ""}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-600">
        Each family sees only their own kid&apos;s line (with a player pass), and pitchers&apos;
        parents get the count to add to their log.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Cancel
        </button>
        <button
          disabled={keep.length === 0}
          onClick={async () => {
            setBusy("Saving…");
            try {
              await onSave(
                keep.map((l) => ({
                  playerId: l.playerId,
                  boxName: l.boxName,
                  batting: l.batting,
                  pitching: l.pitching,
                  errors: l.errors,
                  positions: l.positions,
                })),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(null);
            }
          }}
          className="h-14 flex-1 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save {keep.length} line{keep.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

interface Row {
  playerId: string;
  pitches: string;
  strikes: string;
}

function PitchCountForm({
  players,
  lineup,
  existing,
  onSave,
  onCancel,
}: {
  players: Player[];
  lineup: Lineup;
  existing: KidGame[];
  onSave: (counts: CountToSave[]) => Promise<void>;
  onCancel: () => void;
}) {
  // Start with everyone who already has a count, then whoever pitched in the lineup.
  const [rows, setRows] = useState<Row[]>(() => {
    const out: Row[] = existing
      .filter((l) => (l.pitching?.pitches ?? 0) > 0)
      .map((l) => ({
        playerId: l.playerId,
        pitches: String(l.pitching!.pitches),
        strikes: l.pitching!.strikes ? String(l.pitching!.strikes) : "",
      }));
    for (const s of lineup.slots) {
      if (s.position === "P" && !out.some((r) => r.playerId === s.playerId)) {
        out.push({ playerId: s.playerId, pitches: "", strikes: "" });
      }
    }
    return out;
  });
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "Someone";
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const bad = rows.some((r) => {
    const p = num(r.pitches);
    const s = num(r.strikes);
    return (
      p !== null &&
      (!Number.isInteger(p) ||
        p < 0 ||
        p > 200 ||
        (s !== null && (!Number.isInteger(s) || s < 0 || s > p)))
    );
  });
  const input =
    "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-xl font-bold tabular-nums";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-slate-700">
        Each pitcher&apos;s count for this game. Their parents get it to add to their pitch log.
      </p>
      {rows.length === 0 && (
        <p className="rounded-xl border-2 border-dashed border-slate-300 p-3 text-base">
          No pitchers in this game&apos;s lineup. Add who pitched below.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.playerId} className="rounded-xl border-2 border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-base font-bold">{name(r.playerId)}</span>
              <button
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="h-10 px-2 text-sm font-semibold text-red-700 underline"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold text-slate-600">
                Pitches
                <input
                  inputMode="numeric"
                  value={r.pitches}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, pitches: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) };
                    setRows(next);
                  }}
                  className={input}
                />
              </label>
              <label className="text-sm font-semibold text-slate-600">
                Strikes (optional)
                <input
                  inputMode="numeric"
                  value={r.strikes}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, strikes: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) };
                    setRows(next);
                  }}
                  className={input}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select
          aria-label="Add a pitcher"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-2 text-base"
        >
          <option value="">Add a pitcher…</option>
          {players
            .filter((p) => p.active !== false && !rows.some((r) => r.playerId === p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <button
          disabled={!adding}
          onClick={() => {
            setRows([...rows, { playerId: adding, pitches: "", strikes: "" }]);
            setAdding("");
          }}
          className="h-12 rounded-xl border-2 border-slate-400 bg-white px-4 text-base font-bold disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {bad && (
        <p className="text-base font-semibold text-red-700">
          Pitches go up to 200, and strikes can&apos;t be more than pitches.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Cancel
        </button>
        <button
          disabled={bad || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSave(
                rows
                  .filter((r) => (num(r.pitches) ?? 0) > 0)
                  .map((r) => ({
                    playerId: r.playerId,
                    pitches: num(r.pitches)!,
                    strikes: num(r.strikes),
                  })),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
          className="h-14 flex-1 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
