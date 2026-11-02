"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { themeVars } from "@/lib/branding/theme";
import { formatGameDate, gameContext, gameResult } from "@/lib/data/game";
import type { AppData } from "@/lib/data/types";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { resolveRuleConfig } from "@/lib/rules/config";
import { describeCustomRule } from "@/lib/rules/custom";
import { validateLineup } from "@/lib/rules/validate";
import { AppShell, Loading } from "../AppShell";
import { LineupGrid } from "../LineupGrid";
import { PlayingTime } from "../SeasonScreen";
import { StatTables } from "../stats/StatsScreen";
import { useTeamStats } from "../stats/statsData";
import { ViolationList } from "../ViolationList";

type View = "lineups" | "playing" | "rules" | "stats";
const VIEWS: [View, string][] = [
  ["lineups", "Lineups"],
  ["playing", "Playing time"],
  ["rules", "Rules"],
  ["stats", "Stats"],
];

/** One club team, read-only: its lineups, playing time, fair-play rules and stats. */
export function ClubTeamScreen({ teamId }: { teamId: string }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("lineups");

  useEffect(() => {
    let current = true;
    import("@/lib/data/club-backend")
      .then((m) => m.loadClubTeam(teamId))
      .then(
        (d) => current && setData(d),
        (e: unknown) => current && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      current = false;
    };
  }, [teamId]);

  if (error || !data) {
    return (
      <AppShell title="Club team" backHref="/club" tab="club" bare>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
            {error}
          </p>
        ) : (
          <Loading />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={data.team.name}
      subtitle={`${data.team.ageGroup} · ${data.season.name} · view only`}
      backHref="/club"
      tab="club"
      bare
    >
      <div style={themeVars(data.team.colors) as CSSProperties}>
        <div
          role="tablist"
          className="mb-4 grid grid-cols-4 gap-1 rounded-xl border-2 border-[var(--team)] p-1"
        >
          {VIEWS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-lg px-1 text-sm font-bold sm:text-base ${
                view === id ? "bg-[var(--team)] text-white" : "text-[var(--team)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "lineups" && <Lineups data={data} />}
        {view === "playing" && <PlayingTime data={data} club />}
        {view === "rules" && <Rules data={data} />}
        {view === "stats" && <Stats data={data} />}
      </div>
    </AppShell>
  );
}

function Lineups({ data }: { data: AppData }) {
  const games = [...data.games].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.startTime ?? "").localeCompare(a.startTime ?? ""),
  );
  const firstWithLineup = games.find((g) => (data.lineups[g.id]?.slots.length ?? 0) > 0);
  const [gameId, setGameId] = useState(firstWithLineup?.id ?? games[0]?.id ?? null);
  if (games.length === 0) return <p className="text-lg">No games this season yet.</p>;
  const ctx = gameId ? gameContext(data, gameId) : null;
  const players = new Map(data.players.map((p) => [p.id, p]));
  const violations = ctx
    ? validateLineup(data.players, ctx.lineup, ctx.config, ctx.history, ctx.previous)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold tracking-wide text-slate-600 uppercase">Game</span>
        <select
          value={gameId ?? ""}
          onChange={(e) => setGameId(e.target.value)}
          className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        >
          {games.map((g) => {
            const r = gameResult(g);
            return (
              <option key={g.id} value={g.id}>
                {formatGameDate(g)} · vs {g.opponent}
                {r ? ` · ${r} ${g.scoreUs}–${g.scoreThem}` : g.status === "final" ? " · final" : ""}
                {(data.lineups[g.id]?.slots.length ?? 0) === 0 ? " · no lineup" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {ctx && ctx.lineup.slots.length > 0 ? (
        <>
          {ctx.game.lineupStyle === "competitive" && (
            <p className="rounded-xl bg-slate-100 p-3 text-base">
              Built as a <b>competitive</b> lineup (from GameChanger stats).
            </p>
          )}
          <LineupGrid
            lineup={ctx.lineup}
            players={players}
            positions={ctx.config.fieldPositions}
            violations={violations}
          />
          <ViolationList violations={violations} emptyCells={0} />
          <section>
            <h3 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
              Batting order
            </h3>
            <ol className="list-decimal pl-6 text-base">
              {ctx.lineup.battingOrder
                .filter(
                  (id) =>
                    !(ctx.lineup.notBatting ?? []).includes(id) &&
                    !(ctx.lineup.absent ?? []).includes(id),
                )
                .map((id) => (
                  <li key={id}>{players.get(id)?.name ?? "Unknown player"}</li>
                ))}
            </ol>
            {(ctx.lineup.absent ?? []).length > 0 && (
              <p className="mt-1 text-sm text-slate-600">
                Absent: {(ctx.lineup.absent ?? []).map((id) => players.get(id)?.name).join(", ")}
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
          No lineup set for this game yet.
        </p>
      )}
    </div>
  );
}

function Rules({ data }: { data: AppData }) {
  const config = {
    ...resolveRuleConfig(data.season.fairPlayRules),
    coachPitch: data.team.coachPitch,
  };
  const label = { block: "Must", warn: "Warn", off: "Off" } as const;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          Fair play rules {data.team.coachPitch ? "· coach pitch" : ""}
        </h3>
        <ul className="flex flex-col gap-1">
          {RULE_CATALOG.map((r) => {
            const s = config.severity[r.id];
            return (
              <li
                key={r.id}
                className={`flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-base ${
                  s === "off" ? "text-slate-500" : ""
                }`}
              >
                <span>{r.describe(config)}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${
                    s === "block"
                      ? "bg-slate-900 text-white"
                      : s === "warn"
                        ? "bg-amber-200 text-amber-950"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {label[s]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {config.custom.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            The coach&apos;s own rules
          </h3>
          <ul className="flex flex-col gap-1">
            {config.custom.map((r) => (
              <li
                key={r.id}
                className="flex justify-between gap-3 rounded-lg bg-white px-3 py-2 text-base"
              >
                <span>{describeCustomRule(r, data.players)}</span>
                <span className="shrink-0 text-sm font-bold">{label[r.setting]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stats({ data }: { data: AppData }) {
  const { stats, loading, error } = useTeamStats(data.season.id);
  if (loading) return <Loading />;
  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
        Couldn&apos;t load stats ({error}).
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
        This team hasn&apos;t imported GameChanger stats yet.
      </p>
    );
  }
  return (
    <>
      <p className="mb-3 text-base text-slate-700">
        From GameChanger · imported{" "}
        {new Date(stats.importedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
      </p>
      <StatTables stats={stats.data} data={data} />
    </>
  );
}
