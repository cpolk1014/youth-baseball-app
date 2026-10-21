"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGameDate, gameContext, localDateString, splitGames } from "@/lib/data/game";
import { newId, saveGame, signOut, useAppData, useStoreState } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { validateLineup } from "@/lib/rules/validate";
import { AppShell, Loading } from "./AppShell";
import { GameForm } from "./GameForm";
import { Sheet } from "./Sheet";

export function GamesScreen() {
  const data = useAppData();
  const [adding, setAdding] = useState<Game | null>(null);
  const { mode, email } = useStoreState();

  if (!data) {
    return (
      <AppShell title="Games" tab="games">
        <Loading />
      </AppShell>
    );
  }

  const { upcoming, final } = splitGames(data.games);
  const startAdd = () =>
    setAdding({
      id: newId(),
      seasonId: data.season.id,
      date: localDateString(new Date()),
      startTime: null,
      opponent: "",
      location: null,
      innings: 6,
      status: "scheduled",
    });

  return (
    <AppShell
      title={data.team.name}
      subtitle={`${data.team.ageGroup} · ${data.season.name}`}
      tab="games"
      action={
        <button
          onClick={startAdd}
          className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
        >
          + Game
        </button>
      }
    >
      <Section title="Upcoming" games={upcoming} data={data} empty="No upcoming games." />
      {final.length > 0 && <Section title="Final" games={final} data={data} />}

      <button
        onClick={startAdd}
        className="mt-4 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
      >
        + Add game
      </button>

      {mode === "supabase" && (
        <p className="mt-8 text-center text-sm text-slate-600">
          Signed in{email ? ` as ${email}` : ""} ·{" "}
          <button onClick={() => void signOut()} className="h-10 font-semibold underline">
            Sign out
          </button>
        </p>
      )}

      <Sheet open={adding !== null} title="Add game" onClose={() => setAdding(null)}>
        {adding && (
          <GameForm
            key={adding.id}
            game={adding}
            filledInnings={0}
            onCancel={() => setAdding(null)}
            onSave={(g) => {
              saveGame(g);
              setAdding(null);
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function Section({
  title,
  games,
  data,
  empty,
}: {
  title: string;
  games: Game[];
  data: AppData;
  empty?: string;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">{title}</h2>
      {games.length === 0 ? (
        <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((game) => (
            <GameCard key={game.id} game={game} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameCard({ game, data }: { game: Game; data: AppData }) {
  const ctx = gameContext(data, game.id)!;
  const violations = ctx.hasSavedLineup
    ? validateLineup(data.players, ctx.lineup, ctx.config, ctx.history)
    : [];
  const blocks = violations.filter((v) => v.severity === "block").length;
  const status =
    game.status === "final"
      ? { text: "Final", cls: "bg-slate-700 text-white" }
      : !ctx.hasSavedLineup
        ? { text: "No lineup yet", cls: "bg-slate-200 text-slate-800" }
        : blocks > 0
          ? { text: `${blocks} to fix`, cls: "bg-red-700 text-white" }
          : violations.length > 0
            ? {
                text: `Ready · ${violations.length} warning${violations.length === 1 ? "" : "s"}`,
                cls: "bg-amber-300 text-slate-900",
              }
            : { text: "Lineup ready", cls: "bg-green-700 text-white" };

  return (
    <li>
      <Link
        href={`/games/${game.id}`}
        className="block rounded-xl border-2 border-slate-200 bg-white p-4 active:bg-slate-50"
      >
        <p className="text-sm font-semibold text-slate-600">{formatGameDate(game)}</p>
        <p className="mt-0.5 text-xl font-bold">vs {game.opponent}</p>
        {game.location && <p className="text-base text-slate-700">{game.location}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">{game.innings} innings</span>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${status.cls}`}>
            {status.text}
          </span>
        </div>
      </Link>
    </li>
  );
}
