"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ERA_INNINGS,
  gameLine,
  outsToInnings,
  rate,
  seasonTotals,
  type KidGame,
} from "@/lib/boxscore/stats";
import { myUserId, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { AppShell, Loading } from "../AppShell";
import { kidsOf } from "../KidPicker";
import { Sheet } from "../Sheet";
import { KidTeams } from "./KidTeams";
import { longDate, useStatsPasses } from "./familyPass";
import { StatsTeaser } from "./StatsTeaser";
import { KidWalkup } from "./KidWalkup";
import { PineTar } from "../highlights/PineTar";
import { PitchCount } from "../pitching/PitchCount";
import { StrikeChart, TrendChart } from "../charts/Charts";
import { useToday } from "../useToday";
import { battingTrend, pitchingTrend } from "@/lib/boxscore/trends";
import { useKidGames } from "./kidGames";
import {
  defaultYears,
  inYears,
  toggleYear,
  yearsLabel,
  yearsOf,
  type YearPick,
} from "@/lib/boxscore/years";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/**
 * A parent's own kid: Pine Tar highlight reels, their pitch count, and their stats from the
 * coaches' box scores, following them from team to team.
 */
export function KidStatsScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="My player" tab="account">
        <Loading />
      </AppShell>
    );
  }
  return <KidStats data={data} />;
}

function KidStats({ data }: { data: AppData }) {
  const kids = kidsOf(data, myUserId(data));
  // ?player=<id> (from Roster or My profile) opens that kid when there's more than one.
  const [kidId, setKidId] = useState(
    () => new URLSearchParams(window.location.search).get("player") ?? kids[0]?.id ?? null,
  );
  const kid = kids.find((k) => k.id === kidId) ?? kids[0] ?? null;
  const { games, kidTeams, loading, error, remove, link, split } = useKidGames(
    kids.map((k) => k.id),
  );
  const [filming, setFilming] = useState(false);
  const [open, setOpen] = useState<KidGame | null>(null);
  const fam = useStatsPasses();
  const router = useRouter();
  // The Player pass is bought on My profile.
  const toBuy = () => router.push("/profile#player-stats");
  // The years picked, per kid (opens on this year when there's more than one).
  const [pickBy, setPickBy] = useState<Record<string, YearPick>>({});
  const today = useToday();

  const shell = (children: React.ReactNode) => (
    <AppShell
      title={kid ? kid.name : "My player"}
      subtitle={`${kid ? "My player · " : ""}${data.team.name}`}
      tab="account"
    >
      {children}
    </AppShell>
  );
  if (!kid) {
    return shell(
      <p className="text-lg">
        This is for parents: once you&apos;re linked to your player on this team, their highlight
        reels, pitch count and stats live here.
      </p>,
    );
  }

  // Every team's box scores for this kid (their record follows them from team to team).
  const athlete = kidTeams.find((r) => r.playerId === kid.id)?.athleteId ?? null;
  const mine = games.filter(
    (g) => g.playerId === kid.id || (athlete !== null && g.athleteId === athlete),
  );
  const teamCount = new Set(mine.map((g) => g.teamName ?? "")).size;
  // Games with a batting line (typed pitch counts aren't games batted).
  const batted = mine.filter((g) => !g.pitchOnly);
  // The Player pass, bought by this parent for this kid.
  const unlocked = fam.covers(athlete);
  const expires = fam.expiresFor(athlete);
  const year = Number((today || "2026").slice(0, 4));
  const years = yearsOf(batted);
  const pick = pickBy[kid.id] ?? defaultYears(years, year);
  const shown = inYears(batted, pick);
  const span = years.length <= 1 ? "season" : yearsLabel(pick);
  const t = seasonTotals(shown);
  const b = t.batting;
  const stat = (label: string, value: string | number, big = false) => (
    <div className="flex flex-col items-center rounded-lg bg-slate-50 px-2 py-2">
      <span className={big ? "text-2xl font-black tabular-nums" : "text-xl font-bold tabular-nums"}>
        {value}
      </span>
      <span className="text-xs font-bold tracking-wide text-slate-600 uppercase">{label}</span>
    </div>
  );

  return shell(
    <>
      {kids.length > 1 && (
        <div role="tablist" className="mb-4 flex gap-2">
          {kids.map((k) => (
            <button
              key={k.id}
              role="tab"
              aria-selected={k.id === kid.id}
              onClick={() => setKidId(k.id)}
              className={`h-12 flex-1 rounded-xl text-base font-bold ${
                k.id === kid.id
                  ? "bg-[var(--team)] text-white"
                  : "border-2 border-slate-300 bg-white active:bg-slate-100"
              }`}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => (unlocked ? setFilming(true) : toBuy())}
        className="mb-4 flex w-full items-center gap-3 rounded-xl border-2 border-slate-900 bg-slate-900 p-3 text-left text-white active:bg-slate-800"
      >
        <span aria-hidden="true" className="text-3xl">
          🎬
        </span>
        <span className="flex flex-col">
          <span className="text-lg font-black">Pine Tar Productions</span>
          <span className="text-sm text-white/80">
            Turn a clip into a highlight: name on screen, stadium announcer, slow-mo replay.
            {unlocked ? "" : " 🔒 Comes with the Player pass."}
          </span>
        </span>
      </button>

      <PitchCount
        key={`pitch-${kid.id}`}
        kid={kid}
        athleteId={athlete}
        ageGroup={data.team.ageGroup ?? null}
        games={data.games}
        coachLines={mine}
        today={today || new Date().toISOString().slice(0, 10)}
        unlocked={unlocked}
        onUnlock={toBuy}
      />

      <KidWalkup key={kid.id} data={data} kid={kid} />

      <KidTeams
        key={`teams-${kid.id}`}
        kid={kid}
        teamId={data.team.id}
        kidTeams={kidTeams}
        link={link}
        split={split}
      />

      {loading || fam.loading ? (
        <Loading />
      ) : !unlocked ? (
        <StatsTeaser kid={kid} year={year} onUpgrade={toBuy} />
      ) : error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          Couldn&apos;t load stats ({error}).
        </p>
      ) : batted.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
          No stats yet. When the coaches add a game&apos;s GameChanger box score, {kid.name}&apos;s
          line shows up here and the season adds up. Only you and {kid.name}&apos;s other linked
          parents see it.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {years.length > 1 && (
            <div className="md:col-span-2">
              <p className="mb-1 text-sm font-semibold text-slate-600">
                Years (tap more than one to add them up)
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Years">
                <button
                  onClick={() => setPickBy({ ...pickBy, [kid.id]: "all" })}
                  aria-pressed={pick === "all"}
                  className={`h-11 rounded-full px-4 text-base font-bold ${pick === "all" ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"}`}
                >
                  All years
                </button>
                {years.map((y) => {
                  const on = pick !== "all" && pick.includes(y);
                  return (
                    <button
                      key={y}
                      onClick={() => setPickBy({ ...pickBy, [kid.id]: toggleYear(pick, y) })}
                      aria-pressed={on}
                      className={`h-11 rounded-full px-4 text-base font-bold tabular-nums ${on ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"}`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <section className="rounded-xl border-2 border-slate-200 bg-white p-3">
            <h2 className={heading}>
              {kid.name}&apos;s {span} · {t.games} game{t.games === 1 ? "" : "s"}
              {t.wins + t.losses > 0 ? ` · ${t.wins}-${t.losses}` : ""}
            </h2>
            {expires && (
              <p className="-mt-1 mb-2 text-sm text-slate-600">
                Player pass through {longDate(expires)}.{" "}
                <a href="/profile#player-stats" className="underline">
                  Renew
                </a>
              </p>
            )}
            <div className="mb-2 grid grid-cols-4 gap-2">
              {stat("AVG", rate(b.avg), true)}
              {stat("OBP", rate(b.obp), true)}
              {stat("SLG", rate(b.slg), true)}
              {stat("OPS", rate(b.ops), true)}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {stat("PA", b.pa)}
              {stat("AB", b.ab)}
              {stat("H", b.h)}
              {stat("R", b.r)}
              {stat("RBI", b.rbi)}
              {stat("2B", b.doubles)}
              {stat("3B", b.triples)}
              {stat("HR", b.hr)}
              {stat("BB", b.bb)}
              {stat("K", b.so)}
              {stat("HBP", b.hbp)}
              {stat("SB", b.sb)}
            </div>
            {t.pitching && (
              <>
                <h3 className={`${heading} mt-4`}>
                  Pitching · {t.pitching.games} game{t.pitching.games === 1 ? "" : "s"}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {stat("IP", outsToInnings(t.pitching.outs))}
                  {stat(
                    `ERA (${ERA_INNINGS})`,
                    t.pitching.era === null ? "–" : t.pitching.era.toFixed(2),
                  )}
                  {stat("WHIP", t.pitching.whip === null ? "–" : t.pitching.whip.toFixed(2))}
                  {stat("K", t.pitching.so)}
                  {stat("BB", t.pitching.bb)}
                  {stat("H", t.pitching.h)}
                  {stat("Pitches", t.pitching.pitches)}
                  {stat(
                    "Strike %",
                    t.pitching.strikePct === null
                      ? "–"
                      : `${Math.round(t.pitching.strikePct * 100)}%`,
                  )}
                </div>
              </>
            )}
            <p className="mt-3 text-sm text-slate-600">
              Errors: {t.errors}. ERA is per {ERA_INNINGS} innings, a youth game.
            </p>
          </section>

          <section>
            <h2 className={heading}>Games</h2>
            <ul className="flex flex-col gap-2">
              {shown.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => setOpen(g)}
                    className="flex w-full flex-col rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                  >
                    <span className="flex w-full justify-between gap-2 text-base">
                      <strong>vs {g.opponent}</strong>
                      <span className="text-slate-600">
                        {new Date(`${g.gameDate}T12:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          ...(years.length > 1 ? { year: "numeric" as const } : {}),
                        })}
                        {g.ourRuns !== null && g.theirRuns !== null
                          ? ` · ${g.ourRuns > g.theirRuns ? "W" : g.ourRuns < g.theirRuns ? "L" : "T"} ${g.ourRuns}–${g.theirRuns}`
                          : ""}
                      </span>
                    </span>
                    <span className="text-base text-slate-800">{gameLine(g)}</span>
                    {teamCount > 1 && g.teamName && (
                      <span className="text-sm text-slate-600">for {g.teamName}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Season trends: how the numbers moved game by game. */}
          {shown.length >= 2 && (
            <div className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-2 md:items-start">
              <TrendChart points={battingTrend(shown)} year={year} />
              {pitchingTrend(shown).length >= 2 && (
                <StrikeChart points={pitchingTrend(shown)} year={year} />
              )}
            </div>
          )}
        </div>
      )}

      <Sheet open={filming} title="Pine Tar Productions" onClose={() => setFilming(false)}>
        {filming && <PineTar data={data} kid={kid} />}
      </Sheet>

      <Sheet
        open={open !== null}
        title={open ? `vs ${open.opponent}` : ""}
        onClose={() => setOpen(null)}
      >
        {open && (
          <div className="flex flex-col gap-3 text-base">
            <p>
              {new Date(`${open.gameDate}T12:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="font-bold">{gameLine(open)}</p>
            {open.positions.length > 0 && <p>Played {open.positions.join(", ")}</p>}
            {open.errors > 0 && (
              <p>
                {open.errors} error{open.errors === 1 ? "" : "s"}
              </p>
            )}
            {open.boxName && (
              <p className="text-sm text-slate-600">
                In the box score as {open.boxName}
                {open.teamName ? `, ${open.teamName}` : ""}.
              </p>
            )}
            {open.source === "parent" ? (
              <button
                onClick={() => {
                  const id = open.id;
                  setOpen(null);
                  void remove(id);
                }}
                className="h-12 text-base font-semibold text-red-700 underline"
              >
                Remove this game
              </button>
            ) : (
              <p className="text-sm text-slate-600">From the coaches&apos; box score.</p>
            )}
          </div>
        )}
      </Sheet>
    </>,
  );
}
