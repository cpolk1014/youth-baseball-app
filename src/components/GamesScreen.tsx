"use client";

import Link from "next/link";
import { formatGameDate, gameContext } from "@/lib/data/game";
import { useAppData } from "@/lib/data/store";
import { validateLineup } from "@/lib/rules/validate";
import { AppShell, Loading } from "./AppShell";

export function GamesScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Games" tab="games">
        <Loading />
      </AppShell>
    );
  }

  const games = [...data.games].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <AppShell
      title={data.team.name}
      subtitle={`${data.team.ageGroup} · ${data.season.name}`}
      tab="games"
    >
      <ul className="flex flex-col gap-3">
        {games.map((game) => {
          const ctx = gameContext(data, game.id)!;
          const violations = ctx.hasSavedLineup
            ? validateLineup(data.players, ctx.lineup, ctx.config, ctx.history)
            : [];
          const blocks = violations.filter((v) => v.severity === "block").length;
          const status = !ctx.hasSavedLineup
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
            <li key={game.id}>
              <Link
                href={`/games/${game.id}`}
                className="block rounded-xl border-2 border-slate-200 bg-white p-4 active:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-600">{formatGameDate(game)}</p>
                <p className="mt-0.5 text-xl font-bold">vs {game.opponent}</p>
                {game.location && <p className="text-base text-slate-700">{game.location}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">
                    {game.innings} innings
                  </span>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${status.cls}`}>
                    {status.text}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
