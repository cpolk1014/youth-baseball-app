"use client";

// A team's coaches pick a winner for each of their club's live awards. Picks are private:
// only the club sees them, for its awards show.
import { useState } from "react";
import { dueText, type TeamAward } from "@/lib/club/awards";
import { isCoach } from "@/lib/data/permissions";
import { setClubAwards, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";

const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const backend = () => import("@/lib/data/club-backend");

export function AwardsScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Club awards" tab="awards">
        <Loading />
      </AppShell>
    );
  }
  return <Awards data={data} />;
}

function Awards({ data }: { data: AppData }) {
  const awards = data.clubAwards ?? [];
  const coach = isCoach(data.me.role);
  const [picking, setPicking] = useState<TeamAward | null>(null);
  const players = data.players.filter((p) => p.active);
  const nameOf = (id: string | null) => data.players.find((p) => p.id === id);

  const refresh = async () => setClubAwards(await (await backend()).teamClubAwards(data.team.id));

  return (
    <AppShell title="Club awards" subtitle={data.team.name} tab="awards">
      {awards.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-lg">
          No club awards right now. When your club opens its season awards, they show up here and in
          your To do.
        </p>
      ) : (
        <>
          <p className="mb-4 rounded-xl bg-slate-900 p-3 text-base text-white">
            🤫 Only {awards[0]!.clubName} sees your picks. Keep them a surprise for the awards show.
          </p>
          <ul className="flex flex-col gap-3 md:grid md:grid-cols-2">
            {awards.map((a) => {
              const winner = nameOf(a.playerId);
              return (
                <li
                  key={a.awardId}
                  className="flex flex-col gap-2 rounded-2xl border-2 border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="text-4xl">
                      {a.emoji || "🏅"}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black">{a.name}</h2>
                      {a.description && <p className="text-base text-slate-600">{a.description}</p>}
                      <p
                        className={`mt-1 text-sm font-bold ${a.open ? (a.playerId ? "text-slate-600" : "text-amber-700") : "text-slate-500"}`}
                      >
                        {a.open ? `Pick by ${dueText(a.dueOn)}` : `Closed ${dueText(a.dueOn)}`}
                      </p>
                    </div>
                  </div>
                  {winner ? (
                    <p className="rounded-xl bg-green-50 p-3 text-lg font-bold text-green-900">
                      ✓ {winner.jerseyNumber != null ? `#${winner.jerseyNumber} ` : ""}
                      {winner.name}
                      {a.note && <span className="block text-base font-normal">“{a.note}”</span>}
                    </p>
                  ) : (
                    <p className="text-base text-slate-600">No winner picked yet.</p>
                  )}
                  {coach && a.open && (
                    <button
                      onClick={() => setPicking(a)}
                      className={
                        a.playerId
                          ? "h-12 rounded-xl border-2 border-slate-300 bg-white text-base font-bold"
                          : primary
                      }
                    >
                      {a.playerId ? "Change the pick" : "🏆 Pick the winner"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!coach && (
            <p className="mt-4 text-base text-slate-600">
              The team&apos;s coaches pick the winners.
            </p>
          )}
        </>
      )}

      <Sheet
        open={picking !== null}
        title={picking ? picking.name : ""}
        onClose={() => setPicking(null)}
      >
        {picking && (
          <PickForm
            award={picking}
            players={players}
            onSave={async (playerId, note) => {
              const m = await backend();
              if (playerId) await m.pickClubAward(picking.awardId, data.team.id, playerId, note);
              else await m.unpickClubAward(picking.awardId, data.team.id);
              await refresh();
              setPicking(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function PickForm({
  award,
  players,
  onSave,
}: {
  award: TeamAward;
  players: AppData["players"];
  onSave: (playerId: string | null, note: string) => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState<string | null>(award.playerId);
  const [note, setNote] = useState(award.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (id: string | null) => {
    setBusy(true);
    setError(null);
    onSave(id, note)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-4">
      {award.description && <p className="text-base text-slate-700">{award.description}</p>}
      <div role="radiogroup" aria-label="Winner" className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={playerId === p.id}
            onClick={() => setPlayerId(p.id)}
            className={`flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 text-left text-base font-bold ${
              playerId === p.id
                ? "border-[var(--team)] bg-[var(--team)] text-white"
                : "border-slate-300 bg-white"
            }`}
          >
            {p.jerseyNumber != null && (
              <span className="tabular-nums opacity-70">#{p.jerseyNumber}</span>
            )}
            <span className="min-w-0 truncate">{p.name}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Why? (optional, for the presenter)</span>
        <textarea
          value={note}
          maxLength={200}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hit .450, played every position, never missed a practice"
          className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-lg focus:border-[var(--team)] focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button disabled={busy || !playerId} onClick={() => run(playerId)} className={primary}>
        {busy ? "Saving…" : "Save the pick"}
      </button>
      {award.playerId && (
        <button
          disabled={busy}
          onClick={() => run(null)}
          className="h-12 text-base font-semibold text-red-700 underline"
        >
          Clear the pick
        </button>
      )}
    </div>
  );
}
