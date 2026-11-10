"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Tournament, TournamentGame, TournamentTeam } from "@/lib/data/tournament-backend";
import { useAppData, useStoreState } from "@/lib/data/store";
import {
  CARD_H,
  CARD_HEAD,
  CARD_W,
  ROW_H,
  bracketTrees,
  bracketWinner,
  sideLabel,
} from "@/lib/tournaments/bracket";
import { teamKey } from "@/lib/tournaments/event";
import { placeOf, time12 } from "@/lib/tournaments/schedule";
import { resolveSide, type Seed } from "@/lib/tournaments/standings";
import { AppShell, Loading } from "../AppShell";

const shortDay = (d: string | null) =>
  d ? new Date(`${d}T12:00`).toLocaleDateString("en-US", { weekday: "short" }) : null;

/** The tournament's bracket, drawn from its saved games. */
export function BracketScreen({ id }: { id: string }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const [loaded, setLoaded] = useState<{
    tournament: Tournament;
    teams: TournamentTeam[];
    games: TournamentGame[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "supabase") return;
    let current = true;
    void (async () => {
      const b = await import("@/lib/data/tournament-backend");
      const [r, games] = await Promise.all([b.getTournament(id), b.listGames(id)]);
      if (!current) return;
      if (r) setLoaded({ ...r, games });
      else setError("This tournament doesn't exist.");
    })().catch((e: unknown) => {
      if (current) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      current = false;
    };
  }, [id, mode]);

  const shell = (children: React.ReactNode) => (
    <AppShell
      title="Bracket"
      subtitle={loaded?.tournament.name}
      backHref={`/tournaments/${id}`}
      tab="tournaments"
    >
      {children}
    </AppShell>
  );
  if (!data) return shell(<Loading />);
  if (mode !== "supabase") return shell(<p className="text-lg">Tournaments need sign-in.</p>);
  if (error) return shell(<p className="text-base text-red-700">{error}</p>);
  if (!loaded) return shell(<Loading />);
  return shell(
    <BracketView
      tournamentId={id}
      games={loaded.games}
      seeds={loaded.tournament.seeds ?? []}
      ourName={loaded.teams.find((t) => t.isUs)?.name ?? null}
    />,
  );
}

/** Each bracket drawn left to right, sliding sideways on a phone. */
export function BracketView({
  tournamentId,
  games,
  seeds,
  ourName,
}: {
  tournamentId: string;
  games: TournamentGame[];
  seeds: Seed[];
  ourName: string | null;
}) {
  const trees = bracketTrees(games);
  if (trees.length === 0) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
        <p>The bracket isn&apos;t in yet.</p>
        <Link
          href={`/tournaments/${tournamentId}`}
          className="mt-2 inline-block font-semibold text-[var(--team)]"
        >
          Back to the tournament
        </Link>
      </div>
    );
  }

  /** A side as a team when it's known, else what it's waiting on. */
  const sideName = (side: string) => resolveSide(side, seeds, games) ?? sideLabel(side);
  const isUs = (name: string) => !!ourName && teamKey(name) === teamKey(ourName);
  const seedOf = (name: string) => {
    const s = seeds.find((x) => teamKey(x.name) === teamKey(name));
    return s ? `${s.pool ?? ""}${s.seed}` : null;
  };
  const anyWide = trees.some((t) => t.columns > 1);

  return (
    <div className="flex flex-col gap-6">
      {anyWide && (
        <p className="text-sm text-slate-600 lg:hidden">Slide sideways to see the whole bracket.</p>
      )}
      {trees.map((tree) => {
        const hasChampion = tree === trees[0] && tree.games.length > 1;
        const lineY = tree.final.y + CARD_H / 2;
        const lineX = tree.final.x + CARD_W;
        const finalWinner = bracketWinner(tree.final.game);
        const champion = finalWinner ? sideName(tree.final.game[finalWinner]) : null;
        return (
          <div key={tree.final.game.id} className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="relative" style={{ width: tree.width, height: tree.height }}>
              <svg
                aria-hidden="true"
                width={tree.width}
                height={tree.height}
                className="absolute inset-0 text-slate-400"
              >
                {tree.lines.map((d) => (
                  <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="2" />
                ))}
                {hasChampion && (
                  <path
                    d={`M${lineX} ${lineY}H${tree.width}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                )}
              </svg>
              {tree.games.map(({ game, x, y }) => {
                const win = bracketWinner(game);
                const rows = (["home", "away"] as const).map((side) => {
                  const name = sideName(game[side]);
                  const score = side === "home" ? game.scoreHome : game.scoreAway;
                  return { side, name, score, seed: seedOf(name) };
                });
                const ours = rows.some((r) => isUs(r.name));
                const when = [shortDay(game.date), game.startTime ? time12(game.startTime) : null]
                  .filter(Boolean)
                  .join(" ");
                const card = (
                  <>
                    <div
                      className="flex flex-col justify-center border-b border-slate-200 px-2 leading-tight"
                      style={{ height: CARD_HEAD }}
                    >
                      <span className="truncate text-sm font-bold">
                        {[game.gameNo ? `Game ${game.gameNo}` : null, when]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {placeOf(game) && (
                        <span className="truncate text-sm text-slate-600">{placeOf(game)}</span>
                      )}
                    </div>
                    {rows.map((r) => (
                      <div
                        key={r.side}
                        className={`flex items-center gap-1 px-2 text-sm ${
                          win === r.side ? "font-bold" : win ? "text-slate-500" : "font-semibold"
                        } ${isUs(r.name) ? "text-[var(--team)]" : ""}`}
                        style={{ height: ROW_H }}
                      >
                        {r.seed && (
                          <span className="shrink-0 text-xs font-bold text-slate-500">
                            {r.seed}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate" title={r.name}>
                          {r.name}
                        </span>
                        {r.score !== null && <span className="tabular-nums">{r.score}</span>}
                      </div>
                    ))}
                  </>
                );
                const style = { left: x, top: y, width: CARD_W, height: CARD_H };
                const box = `absolute block overflow-hidden rounded-lg border-2 bg-white ${
                  ours ? "border-[var(--team)]" : "border-slate-300"
                }`;
                return game.gameId ? (
                  <Link key={game.id} href={`/games/${game.gameId}`} className={box} style={style}>
                    {card}
                  </Link>
                ) : (
                  <div key={game.id} className={box} style={style}>
                    {card}
                  </div>
                );
              })}
              {hasChampion && (
                <>
                  <div
                    className="absolute truncate px-3 text-base font-bold"
                    style={{ left: lineX, width: tree.width - lineX, top: lineY - 28 }}
                    title={champion ?? undefined}
                  >
                    {champion ? `🏆 ${champion}` : ""}
                  </div>
                  <div
                    className="absolute px-3 text-sm text-slate-600 italic"
                    style={{ left: lineX, top: lineY + 4 }}
                  >
                    Champion
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
