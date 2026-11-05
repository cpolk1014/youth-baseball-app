"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGameDate, gameResult } from "@/lib/data/game";
import { myUserId } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { AppShell } from "./AppShell";
import { GamePlaceCard } from "./GamePlaceCard";
import { TournamentTag } from "./tournaments/TournamentTag";
import { GamesPane } from "./GamesScreen";
import { kidsOf } from "./KidPicker";
import { ImportBoxScore } from "./kidstats/ImportBoxScore";
import { useKidGames } from "./kidstats/kidGames";
import { useFamilyPasses } from "./kidstats/familyPass";
import { gameLine, sameGame, type KidGame } from "@/lib/boxscore/stats";
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
  const { games: imported, kidTeams, save, remove } = useKidGames(kids.map((k) => k.id));
  // Box score stats are a family add-on; without a pass, Upload goes to My player to unlock.
  const fam = useFamilyPasses();
  const unlocked = (kid: Player) =>
    fam.covers(kidTeams.find((r) => r.playerId === kid.id)?.athleteId ?? null);
  const [importing, setImporting] = useState<Player | null>(null);
  const isFinal = game.status === "final";
  const result = gameResult(game);
  const hasUniform = gameUniformShown(game.uniform, data.uniforms) !== null;
  // This game's box score for a kid: same day and opponent (GameChanger may name the team a
  // little differently); or, when the team played only this game that day, that day's one.
  const onlyGameThatDay = data.games.filter((g) => g.date === game.date).length === 1;
  const importedFor = (kid: Player): KidGame | null => {
    const linked = imported.find((g) => g.playerId === kid.id && g.gameId === game.id);
    if (linked) return linked;
    // Older imports, saved before box scores were tied to a game.
    const mine = imported.filter(
      (g) => g.playerId === kid.id && !g.gameId && g.gameDate === game.date,
    );
    return (
      mine.find((g) => sameGame(g, { gameDate: game.date, opponent: game.opponent })) ??
      (onlyGameThatDay && mine.length === 1 ? mine[0]! : null)
    );
  };

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

      <TournamentTag gameId={game.id} />

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
            {kids.map((kid) => {
              const box = importedFor(kid);
              return (
                <li key={kid.id} className="flex flex-col gap-2">
                  {box ? (
                    <div className="rounded-xl border-2 border-green-700 bg-green-50 p-3">
                      <p className="text-base font-bold text-green-900">
                        ✓ {kid.name}&apos;s box score is in
                      </p>
                      <p className="text-base text-green-950">
                        vs {box.opponent}: {gameLine(box)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-base font-semibold">
                      {kid.name}:{" "}
                      <span className="font-normal text-slate-600">not uploaded yet</span>
                    </p>
                  )}
                  <div className="flex gap-2">
                    {box && (
                      <Link
                        href={`/my-player?player=${kid.id}`}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base font-semibold"
                      >
                        See stats
                      </Link>
                    )}
                    {unlocked(kid) || fam.loading ? (
                      <button
                        onClick={() => setImporting(kid)}
                        disabled={fam.loading}
                        className={`h-12 flex-1 rounded-xl text-base font-bold disabled:opacity-50 ${
                          box
                            ? "border-2 border-slate-300 bg-white text-slate-800 active:bg-slate-100"
                            : "bg-[var(--team)] text-white active:bg-[var(--team-press)]"
                        }`}
                      >
                        {box ? "Replace it" : "Upload box score"}
                      </button>
                    ) : (
                      <Link
                        href={`/my-player?player=${kid.id}`}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--team)] text-base font-bold text-white"
                      >
                        🔒 Unlock box scores
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
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
            existing={imported}
            games={data.games}
            forGame={game}
            replacing={importedFor(importing)}
            onCancel={() => setImporting(null)}
            onSave={async (g, replaces) => {
              await save(g, data.season.id);
              // An earlier import of this game saved without it (or under another game): drop it.
              if (replaces && replaces.gameId !== g.gameId) await remove(replaces.id);
              setImporting(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
