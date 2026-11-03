"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGameDate, gameResult } from "@/lib/data/game";
import { myUserId } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { AppShell } from "./AppShell";
import { GamePlaceCard } from "./GamePlaceCard";
import { GamesPane } from "./GamesScreen";
import { kidsOf } from "./KidPicker";
import { ImportBoxScore } from "./kidstats/ImportBoxScore";
import { useKidGames } from "./kidstats/kidGames";
import { Sheet } from "./Sheet";
import { GameUniformCard } from "./uniforms/GameUniformCard";
import { gameUniformShown } from "@/lib/uniforms";
import type { Player } from "@/lib/rules/types";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/**
 * A game for parents: what to wear, where to go, and their own kid's box score. The lineup,
 * batting order and attendance stay with the coaches.
 */
export function ParentGame({
  data,
  game,
  arrival,
}: {
  data: AppData;
  game: Game;
  arrival: string | null;
}) {
  const kids = kidsOf(data, myUserId(data));
  const { games: imported, save } = useKidGames(kids.map((k) => k.id));
  const [importing, setImporting] = useState<Player | null>(null);
  const isFinal = game.status === "final";
  const result = gameResult(game);
  const hasUniform = gameUniformShown(game.uniform, data.uniforms) !== null;
  // A box score for this game: same day (the opponent's name can differ in GameChanger).
  const importedFor = (kid: Player) =>
    imported.some((g) => g.playerId === kid.id && g.gameDate === game.date);

  return (
    <AppShell
      title={`vs ${game.opponent}`}
      subtitle={formatGameDate(game)}
      backHref="/games"
      tab="games"
      pane={<GamesPane currentId={game.id} />}
    >
      {isFinal && (
        <p
          className={`mb-4 rounded-xl p-3 text-white ${
            result === "W" ? "bg-green-700" : result === "L" ? "bg-red-700" : "bg-slate-700"
          }`}
        >
          <span className="block text-2xl font-black">
            {result
              ? `${result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"} ${game.scoreUs}–${game.scoreThem}`
              : "Final"}
          </span>
        </p>
      )}

      {!isFinal && arrival && (
        <p className="mb-3 rounded-xl bg-white px-3 py-2 text-lg font-bold">Arrive by {arrival}</p>
      )}

      <GamePlaceCard game={game} />

      {hasUniform ? (
        <GameUniformCard game={game} combos={data.uniforms} canEdit={false} />
      ) : (
        <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
          <h2 className={heading}>Uniform</h2>
          <p className="text-base text-slate-700">The coaches haven&apos;t set it yet.</p>
        </section>
      )}

      <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
        <h2 className={heading}>Box score</h2>
        {kids.length === 0 ? (
          <p className="text-base text-slate-700">
            Link your player on{" "}
            <Link href="/members" className="font-semibold text-[var(--team)] underline">
              Coaches &amp; parents
            </Link>{" "}
            to upload their GameChanger box score.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kids.map((kid) => (
              <li key={kid.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-base font-semibold">
                  {kid.name}
                  {importedFor(kid) && (
                    <span className="ml-2 text-sm font-bold text-green-800">✓ Imported</span>
                  )}
                </span>
                {importedFor(kid) && (
                  <Link
                    href="/my-player"
                    className="flex h-12 items-center rounded-xl border-2 border-slate-300 px-3 text-base font-semibold"
                  >
                    Stats
                  </Link>
                )}
                <button
                  onClick={() => setImporting(kid)}
                  className="h-12 rounded-xl bg-[var(--team)] px-4 text-base font-bold text-white active:bg-[var(--team-press)]"
                >
                  {importedFor(kid) ? "Upload again" : "Upload box score"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate-600">
          A GameChanger box score PDF or screenshot. Only your player&apos;s line is kept, and only
          you can see it.
        </p>
      </section>

      <Sheet
        open={importing !== null}
        title="Import a box score"
        onClose={() => setImporting(null)}
      >
        {importing && (
          <ImportBoxScore
            kid={importing}
            onCancel={() => setImporting(null)}
            onSave={async (g) => {
              await save(g, data.season.id);
              setImporting(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
