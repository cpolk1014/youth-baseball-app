"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { logoUrl } from "@/lib/branding/logo";
import { themeVars } from "@/lib/branding/theme";
import { byDay, gameDays, ourSide, todayIn } from "@/lib/tournaments/schedule";
import { asVisitor, fromShared, type SharedTournament } from "@/lib/tournaments/shared";
import { standings, type StandingsInput } from "@/lib/tournaments/standings";
import { describeCriterion } from "@/lib/tournaments/tiebreak";
import { scheduleText, venueFor } from "@/lib/tournaments/venues";
import { Sheet } from "../Sheet";
import { BracketView } from "./BracketScreen";
import { GameRow, dayLabel } from "./TournamentSchedule";
import { PlayTimes, StandingsTable } from "./TournamentStandings";
import { tournamentWhen } from "./TournamentsScreen";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const card = "rounded-xl border-2 border-slate-200 bg-white p-4";
/** How often the page asks for new scores while it's open. */
const REFRESH_MS = 60_000;
const mineKey = (token: string) => `rallycap:shared-team:${token}`;

/**
 * A tournament a Fungo team shared (fungo.team/t/<token>): read-only standings, the
 * "What time do we play tomorrow?" what-ifs for whichever team the visitor is with, the
 * schedule with scores, the bracket and the tie-breakers. Scores come from the sharing team;
 * visitors can't change anything.
 */
export function SharedTournamentScreen({
  token,
  initial,
}: {
  token: string;
  initial: SharedTournament | null;
}) {
  const [shared, setShared] = useState(initial);
  const [gone, setGone] = useState(initial === null);
  const [mine, setMine] = useState<string | null>(null);
  const [tomorrow, setTomorrow] = useState(false);
  const [tab, setTab] = useState<"pool" | "bracket">("pool");

  // The visitor's own team, remembered on this device for this link.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the device's choice
      setMine(localStorage.getItem(mineKey(token)));
    } catch {
      /* private mode: just don't remember */
    }
  }, [token]);
  const pick = (id: string | null) => {
    setMine(id);
    try {
      if (id) localStorage.setItem(mineKey(token), id);
      else localStorage.removeItem(mineKey(token));
    } catch {
      /* fine */
    }
  };

  // New scores as the team enters them: every minute while the page is in front.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await getBrowserSupabase().rpc("shared_tournament", {
        p_token: token,
      });
      if (error) return;
      const next = fromShared(data);
      if (next) setShared(next);
      else setGone(true);
    };
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const onShow = () => void refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [token]);

  const teams = useMemo(() => (shared ? asVisitor(shared.teams, mine) : []), [shared, mine]);
  const input: StandingsInput | null = useMemo(
    () =>
      shared && {
        teams: teams.map((x) => ({ id: x.id, name: x.name })),
        games: shared.games,
        rules: shared.ruleSet?.rules ?? [],
        restart: shared.ruleSet?.restart ?? true,
        seeding: shared.tournament.seeding,
      },
    [shared, teams],
  );
  const tables = useMemo(() => (input ? standings(input) : []), [input]);

  if (gone || !shared || !input) {
    return (
      <Frame>
        <section className={card}>
          <h1 className="text-2xl font-black text-[#1B2A4A]">
            This link isn&apos;t shared anymore
          </h1>
          <p className="mt-2 text-base text-slate-700">
            The team that shared this tournament turned the link off. Ask them for a new one.
          </p>
        </section>
      </Frame>
    );
  }

  const { tournament: t, games, ruleSet, team } = shared;
  const me = teams.find((x) => x.isUs) ?? null;
  const pool = games.filter((g) => g.stage === "pool");
  const bracket = games.filter((g) => g.stage === "bracket");
  const scored = pool.filter((g) => g.scoreHome !== null).length;
  const days = gameDays(t, games, todayIn(team.timezone));
  const shown = games.map((g) => ({
    ...g,
    parkName: venueFor(scheduleText(g), t.places)?.name ?? null,
  }));
  // The bracket is drawn; pool play is listed by day.
  const showBracket = bracket.length > 0 && (tab === "bracket" || pool.length === 0);
  const listed = shown.filter((g) => g.stage === "pool");
  const logo = logoUrl(team.logoPath);
  const links: [string, string][] = [];
  for (const [label, href] of [
    ["Tournament site", t.infoUrl],
    ["Schedule page", t.scheduleUrl],
    ["Bracket page", t.bracketUrl],
  ] as const) {
    if (href) links.push([label, href]);
  }

  return (
    <Frame colors={team.colors}>
      <section className={card}>
        <h1 className="text-2xl leading-tight font-black text-slate-900">{t.name}</h1>
        <p className="mt-1 text-base font-semibold text-slate-700">
          {[t.organization, tournamentWhen(t), t.city].filter(Boolean).join(" · ")}
        </p>
        {t.division && <p className="text-base text-slate-700">Division: {t.division}</p>}
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- a small team logo
            <img src={logo} alt="" width={24} height={24} className="size-6 rounded" />
          )}
          Kept up to date by {team.name} on Fungo. Scores update as they come in.
        </p>
        {links.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {links.map(([label, href]) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-1 rounded-full border-2 border-slate-200 px-3 text-sm font-semibold text-[var(--team)] active:bg-slate-50"
                >
                  {label}
                  <span aria-hidden className="text-slate-400">
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <label htmlFor="my-team" className={heading}>
          Which team are you with?
        </label>
        <select
          id="my-team"
          value={me?.id ?? ""}
          onChange={(e) => pick(e.target.value || null)}
          className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg font-semibold focus:border-[var(--team)] focus:outline-none"
        >
          <option value="">Pick your team…</option>
          {teams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {pool.length > 0 && (
          <>
            <button
              onClick={() => setTomorrow(true)}
              disabled={!me || days.when !== "on"}
              className="mt-3 flex min-h-14 w-full items-center justify-center rounded-xl bg-[var(--team)] px-4 text-lg font-bold text-white active:bg-[var(--team-press)] disabled:bg-slate-300 disabled:text-slate-600"
            >
              🕘 What time do we play tomorrow?
            </button>
            <p className="mt-1 text-sm text-slate-600">
              {!me
                ? "Pick your team first, and it works out every way the games left could go."
                : days.when === "before"
                  ? `Available on game day (${new Date(`${days.first}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}), as scores come in.`
                  : days.when === "after"
                    ? "The tournament is over."
                    : days.when === "on"
                      ? "Works out every way the games left could go."
                      : "Available on game day."}
            </p>
          </>
        )}
      </section>

      {pool.length > 0 && (
        <section className={card}>
          <h2 className={heading}>Standings</h2>
          {t.seedsLockedAt && t.seeds ? (
            <>
              <p className="mb-2 text-base font-semibold">🔒 Seeds are set</p>
              <ol className="flex flex-col divide-y divide-slate-100">
                {t.seeds.map((s) => (
                  <li
                    key={s.teamId}
                    className={`flex items-center gap-3 py-2 ${s.teamId === me?.id ? "font-bold text-[var(--team)]" : ""}`}
                  >
                    <span className="w-10 text-lg font-bold tabular-nums">
                      {s.pool ? `${s.pool}${s.seed}` : s.seed}
                    </span>
                    <span className="text-base">{s.name}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-600">
                {scored === 0
                  ? `No scores yet. Standings start when the first of the ${pool.length} pool games is scored.`
                  : `${scored} of ${pool.length} pool games scored.`}
              </p>
              {tables.map((tb) => (
                <StandingsTable
                  key={tb.pool ?? "all"}
                  pool={tb.pool}
                  rows={tb.rows}
                  usId={me?.id}
                  started={scored > 0}
                />
              ))}
              {scored > 0 && (
                <p className="text-sm text-slate-600">
                  T-2 means tied for 2nd. RS: runs scored. RA: runs allowed.
                </p>
              )}
            </>
          )}
          <details className="mt-3 rounded-lg bg-slate-50 p-3 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-base font-semibold">
              <span>Tie-breakers: {ruleSet ? ruleSet.name : "not added yet"}</span>
              <span aria-hidden className="text-slate-500">
                ▾
              </span>
            </summary>
            {ruleSet ? (
              <ol className="mt-1 list-decimal pl-5 text-sm text-slate-700">
                {ruleSet.rules.map((c, i) => (
                  <li key={i}>{describeCriterion(c)}</li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">
                Teams are ranked by record; ties stay ties until the tie-break rules are added.
              </p>
            )}
            <p className="mt-1 text-sm text-slate-600">
              Seeds {t.seeding === "pool" ? "within each pool" : "across all pool games"}.
            </p>
          </details>
        </section>
      )}

      <section className={card}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Schedule</h2>
          {bracket.length > 0 && pool.length > 0 && (
            <div className="flex rounded-lg bg-slate-100 p-1" role="tablist">
              {(["pool", "bracket"] as const).map((x) => (
                <button
                  key={x}
                  role="tab"
                  aria-selected={tab === x}
                  onClick={() => setTab(x)}
                  className={`h-10 rounded-md px-3 text-sm font-bold ${tab === x ? "bg-white shadow" : "text-slate-600"}`}
                >
                  {x === "pool" ? "Pool play" : "Bracket"}
                </button>
              ))}
            </div>
          )}
        </div>
        {games.length === 0 ? (
          <p className="text-base text-slate-700">The schedule isn&apos;t out yet.</p>
        ) : showBracket ? (
          <BracketView
            tournamentId={t.id}
            games={shown}
            seeds={t.seeds ?? []}
            ourName={me?.name ?? null}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {byDay(listed).map((d) => (
              <div key={d.date ?? "none"}>
                <h3 className="mb-1 text-base font-bold">{dayLabel(d.date)}</h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {d.games.map((g) => (
                    <GameRow
                      key={g.id}
                      g={g}
                      ours={!!ourSide(g, me?.name ?? null)}
                      oursLabel="Your game"
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {t.places.length > 0 && (
        <section className={card}>
          <h2 className={heading}>Where</h2>
          <ul className="flex flex-col gap-2">
            {t.places.map((p) => (
              <li key={p.name} className="text-base">
                <span className="block font-semibold">{p.name}</span>
                {p.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[var(--team)] underline"
                  >
                    {p.address} ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet
        open={tomorrow}
        title="What time do we play tomorrow?"
        onClose={() => setTomorrow(false)}
      >
        {tomorrow && me && (
          <PlayTimes
            input={input}
            games={games}
            tournament={t}
            us={me}
            ourPool={tables.flatMap((x) => x.rows).find((r) => r.teamId === me.id)?.pool ?? null}
            teamCount={tables.reduce((n, x) => Math.max(n, x.rows.length), 0)}
            scored={scored}
            note={`For ${me.name}. Based on ${scored} of ${pool.length} pool games scored${ruleSet ? ` and the ${ruleSet.name} tie-breakers` : " (no tie-breakers added yet, so ties stay ties)"}.`}
          />
        )}
      </Sheet>
    </Frame>
  );
}

/** Fungo's bar on top, the trial pitch at the bottom, the team's colors in between. */
function Frame({ colors, children }: { colors?: string[]; children: React.ReactNode }) {
  return (
    <div style={themeVars(colors) as React.CSSProperties} className="min-h-dvh bg-slate-50">
      <header className="flex items-center justify-between gap-3 bg-[#1B2A4A] px-4 py-3">
        <Link href="/welcome" aria-label="Fungo">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
          <img
            src="/brand/fungo-horizontal-white.svg"
            alt="Fungo"
            width={120}
            height={32}
            className="h-8 w-auto"
          />
        </Link>
        <Link
          href="/login"
          className="flex h-11 items-center rounded-lg bg-[#DC143C] px-3 text-sm font-bold text-white"
        >
          Try it free
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        {children}
        <aside className="rounded-xl bg-[#1B2A4A] p-5 text-white">
          <p className="text-xl font-black">Coach a youth baseball team?</p>
          <p className="mt-1 text-base text-white/90">
            Fungo keeps standings like these for your tournaments, plus fair lineups, team chat and
            more. Free for 14 days, no credit card.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/login"
              className="flex h-12 items-center justify-center rounded-xl bg-[#DC143C] px-5 text-base font-bold text-white"
            >
              Start your free 14-day trial
            </Link>
            <Link
              href="/welcome"
              className="flex h-12 items-center justify-center rounded-xl border-2 border-white/40 px-5 text-base font-bold text-white"
            >
              See what Fungo does
            </Link>
          </div>
        </aside>
        <p className="pb-4 text-center text-xs text-slate-500">
          Shared by a team on Fungo. Scores come from that team, not the tournament.{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </main>
    </div>
  );
}
