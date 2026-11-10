"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canDeleteGame, hasLineup } from "@/lib/data/gameDelete";
import { deleteGames, useStoreState } from "@/lib/data/store";
import type { Game } from "@/lib/data/types";
import type { Lineup } from "@/lib/rules/types";
import { DeleteGamePanel } from "./DeleteGamePanel";

type Found = Awaited<ReturnType<typeof import("@/lib/data/tournament-backend").tournamentForGame>>;

/** At the bottom of Edit game: delete it, or why it can't be deleted here. */
export function GameDeleteSection({
  game,
  lineup,
  onClose,
}: {
  game: Game;
  lineup: Lineup | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const { mode } = useStoreState();
  // undefined while we find out whether the game is part of a tournament.
  const [found, setFound] = useState<Found | undefined>(mode === "supabase" ? undefined : null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (mode !== "supabase") return;
    let current = true;
    import("@/lib/data/tournament-backend")
      .then((m) => m.tournamentForGame(game.id))
      .then(
        (f) => current && setFound(f),
        () => current && setLookupFailed(true),
      );
    return () => {
      current = false;
    };
  }, [game.id, mode]);

  const note = "mt-4 border-t-2 border-slate-100 pt-4 text-base leading-snug text-slate-700";
  if (lookupFailed) {
    return <p className={note}>Deleting a game needs a connection.</p>;
  }
  if (found === undefined) return null;
  if (found) {
    return (
      <p className={note}>
        This game is part of {found.name}.{" "}
        <Link
          href={`/tournaments/${found.tournamentId}`}
          className="font-semibold text-[var(--team)] underline underline-offset-4"
        >
          Remove it from the tournament
        </Link>
      </p>
    );
  }
  // A final game has no Edit button; it has to be reopened first.
  if (!canDeleteGame(game)) return null;
  return (
    <div className="mt-4 border-t-2 border-slate-100 pt-4">
      {confirming ? (
        <DeleteGamePanel
          games={[game]}
          action="Delete"
          onDelete={() => deleteGames([game.id])}
          onDone={() => {
            onClose();
            router.replace("/games");
          }}
          onCancel={() => setConfirming(false)}
        >
          <p className="font-bold">
            Delete the game against {game.opponent}? This can&apos;t be undone.
          </p>
          {hasLineup(lineup) && <p>Its lineup and batting order go with it.</p>}
        </DeleteGamePanel>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-12 w-full rounded-xl border-2 border-red-200 bg-white text-base font-semibold text-red-700"
        >
          Delete this game
        </button>
      )}
    </div>
  );
}
