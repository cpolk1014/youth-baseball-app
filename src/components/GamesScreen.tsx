"use client";

import { PlanBanner, usePlan } from "./paywall";
import { AwardsBanner } from "./awards/AwardsBanner";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  defaultFieldPlayers,
  formatGameDate,
  localDateString,
  recordText,
  splitGames,
  whenText,
  recentPlaces,
  placeLabel,
} from "@/lib/data/game";
import { permissionsFor } from "@/lib/data/permissions";
import { newId, saveGame, useAppData, useStoreState } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { lineupStatus, type StatusTone } from "@/lib/dashboard";
import { AppShell, Loading } from "./AppShell";
import { GameForm } from "./GameForm";
import { ImportSchedule } from "./ImportSchedule";
import { TeamBadge } from "./TeamBadge";
import { useToday } from "./useToday";
import { MoneyNudge } from "./MoneyParts";
import { Sheet } from "./Sheet";
import { Shortcut } from "./shell/useShortcut";
import { TeamSwitcher } from "./TeamSwitcher";

export function GamesScreen() {
  const data = useAppData();
  const [adding, setAdding] = useState<Game | null>(null);
  // Adding games starts with the import (a screenshot, PDF or file); "Add manually" is there too.
  const [importing, setImporting] = useState(false);
  const { mode } = useStoreState();
  const [switching, setSwitching] = useState(false);
  const { paid } = usePlan();

  if (!data) {
    return (
      <AppShell title="Games" tab="games">
        <Loading />
      </AppShell>
    );
  }

  const { upcoming, final } = splitGames(data.games);
  const canEdit = permissionsFor(data.me.role).editTeam;
  // The import needs the server (and a signal); otherwise go straight to the form.
  // Importing a schedule is a paid (AI) feature; adding games by hand is free.
  const canImport =
    paid && mode === "supabase" && (typeof navigator === "undefined" || navigator.onLine);
  const startAdd = () => (canImport ? setImporting(true) : addManually());
  const addManually = () =>
    setAdding({
      id: newId(),
      seasonId: data.season.id,
      date: localDateString(new Date()),
      startTime: null,
      opponent: "",
      location: null,
      innings: 6,
      fieldPlayers: defaultFieldPlayers(data.team.coachPitch),
      status: "scheduled",
    });

  return (
    <AppShell
      title={data.team.name}
      subtitle={[data.team.ageGroup, data.season.name, recordText(data.games)]
        .filter(Boolean)
        .join(" · ")}
      tab="games"
      onTitleTap={mode === "supabase" ? () => setSwitching(true) : undefined}
      action={
        canEdit ? (
          <button
            onClick={startAdd}
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
          >
            + Game
          </button>
        ) : undefined
      }
    >
      {/* Keyboards: N adds a game. */}
      <Shortcut keyName="n" run={startAdd} enabled={canEdit} />
      <PlanBanner />
      <AwardsBanner data={data} />
      <MoneyNudge />
      {upcoming[0] && <NextGame game={upcoming[0]} data={data} />}
      <Section title="Upcoming" games={upcoming} data={data} empty="No upcoming games." />
      {final.length > 0 && <Section title="Final" games={final} data={data} />}

      {canEdit && (
        <button
          onClick={startAdd}
          className="mt-4 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add game
        </button>
      )}
      {canEdit && mode === "supabase" && !data.tournamentCount && (
        <Link
          href="/tournaments"
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold text-[var(--team)] underline"
        >
          🏆 Playing in a tournament? Add it
        </Link>
      )}

      <TeamSwitcher
        open={switching}
        onClose={() => setSwitching(false)}
        teams={data.myTeams}
        currentTeamId={data.team.id}
      />

      <Sheet open={importing} title="Add games" onClose={() => setImporting(false)}>
        {importing && (
          <ImportSchedule
            data={data}
            gamesOnly
            onClose={() => setImporting(false)}
            onManual={() => {
              setImporting(false);
              addManually();
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding !== null} title="Add game" onClose={() => setAdding(null)}>
        {adding && (
          <GameForm
            key={adding.id}
            game={adding}
            filledInnings={0}
            arriveMinutes={data.team.gameDay?.arriveMinutes ?? null}
            recentPlaces={recentPlaces(data.games)}
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
        <ul className="grid gap-3 md:grid-cols-2">
          {games.map((game) => (
            <GameCard key={game.id} game={game} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Badge colors for a game's lineup or result. */
export const TONE_CLASS: Record<StatusTone, string> = {
  win: "bg-green-700 text-white",
  loss: "bg-red-700 text-white",
  tie: "bg-slate-500 text-white",
  final: "bg-slate-700 text-white",
  none: "bg-slate-200 text-slate-800",
  block: "bg-red-700 text-white",
  warn: "bg-amber-300 text-slate-900",
  ready: "bg-green-700 text-white",
};

function GameCard({ game, data }: { game: Game; data: AppData }) {
  const status = lineupStatus(data, game);
  return (
    <li>
      <Link
        href={`/games/${game.id}`}
        className="block h-full rounded-xl border-2 border-slate-200 bg-white p-4 active:bg-slate-50 lg:border lg:transition-shadow lg:hover:border-slate-300 lg:hover:shadow-md"
      >
        <p className="text-sm font-semibold text-slate-600">{formatGameDate(game)}</p>
        <p className="mt-0.5 text-xl font-bold">vs {game.opponent}</p>
        {placeLabel(game) && <p className="text-base text-slate-700">{placeLabel(game)}</p>}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">{game.innings} innings</span>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${TONE_CLASS[status.tone]}`}>
            {status.text}
          </span>
        </div>
      </Link>
    </li>
  );
}

/** Wide screens: every game in a column beside the one that's open. */
export function GamesPane({ currentId }: { currentId: string }) {
  const data = useAppData();
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [currentId]);
  if (!data) return null;
  // Parents don't see lineup status, only results.
  const parent = data.me.role === "parent";
  const { upcoming, final } = splitGames(data.games);
  const group = (title: string, games: Game[]) =>
    games.length > 0 && (
      <>
        <p className="sticky top-16 z-10 bg-white/95 px-4 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase backdrop-blur">
          {title}
        </p>
        <ul className="px-2">
          {games.map((g) => {
            const on = g.id === currentId;
            const status = lineupStatus(data, g);
            return (
              <li key={g.id}>
                <Link
                  ref={on ? current : undefined}
                  href={`/games/${g.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    on ? "bg-[var(--team)]/10" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[15px] font-semibold ${on ? "text-[var(--team)]" : "text-slate-900"}`}
                    >
                      vs {g.opponent}
                    </span>
                    <span className="block truncate text-sm text-slate-500">
                      {formatGameDate(g)}
                    </span>
                  </span>
                  {(!parent || g.status === "final") && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${TONE_CLASS[status.tone]}`}
                    >
                      {status.text.replace(/^Ready · .*/, "Ready")}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </>
    );
  return (
    <div className="pb-6">
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Link href="/games" className="text-lg font-bold tracking-tight hover:underline">
          Games
        </Link>
        {recordText(data.games) && (
          <span className="text-sm font-semibold text-slate-500">{recordText(data.games)}</span>
        )}
      </div>
      {group("Upcoming", upcoming)}
      {group("Final", final)}
    </div>
  );
}

/** The next game, front and center in the team's colors. */
function NextGame({ game, data }: { game: Game; data: AppData }) {
  const today = useToday();
  const when = today ? whenText(game.date, today) : "";
  const time = game.startTime
    ? new Date(`2000-01-01T${game.startTime}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <Link
      href={`/games/${game.id}`}
      className="mb-5 flex items-center gap-4 overflow-hidden rounded-2xl border-b-8 border-[var(--team-accent)] bg-[var(--team)] p-4 text-white shadow-md active:bg-[var(--team-press)]"
    >
      <TeamBadge
        name={data.team.name}
        colors={data.team.colors}
        logoPath={data.team.logoPath}
        size={64}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold tracking-wide text-white/75 uppercase">
          Next game{when ? ` · ${when}` : ""}
        </span>
        <span className="block truncate text-2xl leading-tight font-black">vs {game.opponent}</span>
        <span className="block truncate text-base text-white/90">
          {[time, placeLabel(game)].filter(Boolean).join(" · ") || formatGameDate(game)}
        </span>
      </span>
      <span aria-hidden="true" className="text-3xl text-white/70">
        ›
      </span>
    </Link>
  );
}
