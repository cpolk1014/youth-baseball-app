"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStoreState } from "@/lib/data/store";

type Found = Awaited<ReturnType<typeof import("@/lib/data/tournament-backend").tournamentForGame>>;

/** On a team game that's part of a tournament: which one, and a link to its schedule. */
export function TournamentTag({ gameId }: { gameId: string }) {
  const { mode } = useStoreState();
  const [found, setFound] = useState<Found>(null);

  useEffect(() => {
    if (mode !== "supabase") return;
    let current = true;
    import("@/lib/data/tournament-backend")
      .then((m) => m.tournamentForGame(gameId))
      .then(
        (f) => current && setFound(f),
        () => current && setFound(null),
      );
    return () => {
      current = false;
    };
  }, [gameId, mode]);

  if (!found) return null;
  const g = found.game;
  const detail = [
    g.gameNo ? `Game ${g.gameNo}` : null,
    g.stage === "pool" ? (g.pool ? `Pool ${g.pool}` : "Pool play") : (g.round ?? "Bracket"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/tournaments/${found.tournamentId}`}
      className="mb-3 flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 border-[var(--team)] bg-white px-3 py-2"
    >
      <span className="min-w-0">
        <span className="block text-base font-bold">{found.name}</span>
        <span className="block text-sm text-slate-600">{detail}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[var(--team)]">Schedule →</span>
    </Link>
  );
}
