"use client";

import Link from "next/link";
import { formatGameDate, gameResult } from "@/lib/data/game";
import { myUserId } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { AppShell } from "./AppShell";
import { GamePlaceCard } from "./GamePlaceCard";
import { TournamentTag } from "./tournaments/TournamentTag";
import { GamesPane } from "./GamesScreen";
import { kidsOf } from "./KidPicker";
import { useKidGames } from "./kidstats/kidGames";
import { useStatsPasses } from "./kidstats/familyPass";
import { gameLine, type KidGame } from "@/lib/boxscore/stats";
import { useToday } from "./useToday";
import { GameUniformCard } from "./uniforms/GameUniformCard";
import { gameUniformShown } from "@/lib/uniforms";
import type { Player } from "@/lib/rules/types";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/**
 * A game for parents: what to wear, where to go, and their own kid's line from the coaches'
 * box score. The lineup, batting order and attendance stay with the coaches.
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
  const { games: lines, kidTeams } = useKidGames(kids.map((k) => k.id));
  // The Player pass is bought on My profile.
  const fam = useStatsPasses();
  const unlocked = (kid: Player) =>
    fam.covers(kidTeams.find((r) => r.playerId === kid.id)?.athleteId ?? null);
  const isFinal = game.status === "final";
  const result = gameResult(game);
  const hasUniform = gameUniformShown(game.uniform, data.uniforms) !== null;
  const today = useToday();
  // This game's line for a kid, from the coaches' box score (or a parent's own old import).
  const lineFor = (kid: Player): KidGame | null =>
    lines.find((g) => g.playerId === kid.id && g.gameId === game.id && !g.pitchOnly) ??
    lines.find((g) => g.playerId === kid.id && g.gameId === game.id) ??
    null;

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

      {kids.length > 0 && (isFinal || game.date <= today) && (
        <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
          <h2 className={heading}>Box score</h2>
          <ul className="flex flex-col gap-2">
            {kids.map((kid) => {
              const box = lineFor(kid);
              return (
                <li key={kid.id} className="flex flex-col gap-2">
                  {!unlocked(kid) && !fam.loading ? (
                    <p className="text-base">
                      {kid.name}&apos;s line from the coaches&apos; box score, their pitch count and
                      highlight reels come with the Player pass.{" "}
                      <Link href="/profile#player-stats" className="font-semibold underline">
                        Unlock
                      </Link>
                    </p>
                  ) : box ? (
                    <Link
                      href={`/my-player?player=${kid.id}`}
                      className="rounded-xl border-2 border-green-700 bg-green-50 p-3 active:bg-green-100"
                    >
                      <span className="block text-base font-bold text-green-900">
                        {kid.name}: {gameLine(box)}
                      </span>
                      {box.pitching && box.pitching.pitches > 0 && (
                        <span className="block text-base text-green-950">
                          {box.pitching.pitches} pitches: add it to the pitch count on My player.
                        </span>
                      )}
                    </Link>
                  ) : (
                    <p className="text-base text-slate-700">
                      {kid.name}: the coaches haven&apos;t added this game&apos;s box score yet.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
