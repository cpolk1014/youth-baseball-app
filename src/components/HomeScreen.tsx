"use client";

import { dueText } from "@/lib/club/awards";
import { PlanBanner } from "./paywall";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { coachTodos, comingUp, lineupStatus, seasonRecord, type Todo } from "@/lib/dashboard";
import { gameRuns } from "@/lib/charts";
import {
  arriveBy,
  finalLineups,
  formatClock,
  gameContext,
  placeLabel,
  recordText,
  whenText,
} from "@/lib/data/game";
import { isCoach, permissionsFor } from "@/lib/data/permissions";
import { myUserId, useAppData, useStoreState } from "@/lib/data/store";
import type { AppData, Game } from "@/lib/data/types";
import { summaryToShow } from "@/lib/finance/entry";
import { playerLedger } from "@/lib/finance/ledger";
import { formatCents, shortDate } from "@/lib/finance/money";
import { homeworkStatus } from "@/lib/plays/homework";
import { resolveRuleConfig } from "@/lib/rules/config";
import { seasonSummary } from "@/lib/season/summary";
import { detectPlatform, isPhoneOrTablet, openInLinks } from "@/lib/places/maps";
import { gameUniformShown } from "@/lib/uniforms";
import { AppShell, Loading } from "./AppShell";
import { RunsChart } from "./charts/Charts";
import { TONE_CLASS } from "./GamesScreen";
import { TeamBadge } from "./TeamBadge";
import { TeamSwitcher } from "./TeamSwitcher";
import { useToday } from "./useToday";

/** Home: the team at a glance (phones open on Games and reach this from the menu). */
export function HomeScreen() {
  const data = useAppData();
  const today = useToday();
  const { mode } = useStoreState();
  const [switching, setSwitching] = useState(false);

  if (!data || !today) {
    return (
      <AppShell title="Home" tab="home">
        <Loading />
      </AppShell>
    );
  }
  const staff = isCoach(data.me.role) || data.me.role === "manager";
  const parent = data.me.role === "parent";
  const next = comingUp(data.games, [], today, 1)[0];

  return (
    <AppShell
      title={data.team.name}
      subtitle={[data.team.ageGroup, data.season.name, recordText(data.games)]
        .filter(Boolean)
        .join(" · ")}
      tab="home"
      onTitleTap={mode === "supabase" ? () => setSwitching(true) : undefined}
    >
      <PlanBanner />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2">
          {next?.kind === "game" ? (
            <NextGame game={next.game} data={data} today={today} />
          ) : (
            <Card title="Next game">
              <p className="text-base text-slate-600">No games coming up.</p>
              <Link href="/games" className="mt-2 inline-block font-semibold text-[var(--team)]">
                Go to Games ›
              </Link>
            </Card>
          )}
        </div>
        <RecordCard data={data} today={today} />
        {staff && <TodoCard todos={coachTodos(data, today)} />}
        {staff && (data.clubAwards?.length ?? 0) > 0 && <AwardsCard data={data} />}
        <ComingUpCard data={data} today={today} />
        {!parent && <PlayingTimeCard data={data} />}
        <MoneyCard data={data} today={today} />
        {!staff && <HomeworkCard data={data} today={today} />}
      </div>
      <TeamSwitcher
        open={switching}
        onClose={() => setSwitching(false)}
        teams={data.myTeams}
        currentTeamId={data.team.id}
      />
    </AppShell>
  );
}

function Card({
  title,
  href,
  linkText,
  children,
  className = "",
}: {
  title: string;
  href?: string;
  linkText?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">{title}</h2>
        {href && (
          <Link
            href={href}
            className="-my-2 flex min-h-11 items-center text-sm font-semibold text-[var(--team)] hover:underline"
          >
            {linkText ?? "Open"} ›
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-2">
      <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">{label}</p>
      <p className={`truncate text-base font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/** The next game in the team's colors: when, where, what to wear, and the lineup. */
function NextGame({ game, data, today }: { game: Game; data: AppData; today: string }) {
  const status = lineupStatus(data, game);
  const lineup = gameContext(data, game.id)?.lineup;
  const roster = data.players.filter((p) => p.active !== false).length;
  const out = lineup?.absent?.length ?? 0;
  const uniform = gameUniformShown(game.uniform, data.uniforms);
  const arrive = arriveBy(game, data.team.gameDay ? data.team.gameDay.arriveMinutes : null);
  const parent = data.me.role === "parent";
  return (
    <section className="flex h-full flex-col gap-4 rounded-2xl bg-[var(--team)] p-5 text-white shadow-sm md:flex-row md:items-center md:p-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <TeamBadge
          name={data.team.name}
          colors={data.team.colors}
          logoPath={data.team.logoPath}
          size={64}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-wide text-white/70 uppercase">
            <span className="block md:inline">
              Next game<span className="hidden md:inline"> · </span>
            </span>
            <span className="block md:inline">
              {whenText(game.date, today)}
              {game.startTime ? ` · ${formatClock(game.startTime)}` : ""}
            </span>
          </p>
          <p className="line-clamp-2 text-2xl leading-tight font-black tracking-tight md:text-3xl">
            vs {game.opponent}
          </p>
          {placeLabel(game) && (
            <p className="truncate text-base text-white/85">{placeLabel(game)}</p>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 md:w-80">
        {/* Families don't need the lineup's status or the head count. */}
        {!parent && <Fact label="Lineup" value={status.text} />}
        {!parent && (
          <Fact
            label="Players"
            value={out > 0 ? `${roster - out} of ${roster} here` : `All ${roster}`}
          />
        )}
        <Fact label="Arrive by" value={arrive ?? "—"} />
        <Fact label="Uniform" value={uniform ? (uniform.name ?? "Custom") : "Not set"} />
        {parent && <Directions game={game} />}
        <Link
          href={`/games/${game.id}`}
          className="col-span-2 flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-[var(--team)] hover:bg-slate-100"
        >
          Open game ›
        </Link>
      </div>
    </section>
  );
}

/** Directions in this device's maps app (Apple Maps on iPhone, Google Maps elsewhere). */
function Directions({ game }: { game: Game }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!game.location) return;
    const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    const first = openInLinks(
      {
        name: game.location,
        address: game.locationAddress ?? null,
        lat: game.locationLat ?? null,
        lng: game.locationLng ?? null,
        placeId: game.locationPlaceId ?? null,
      },
      platform,
      isPhoneOrTablet(platform, navigator.userAgent),
    )[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this device's maps app
    setHref(first?.href ?? null);
  }, [
    game.location,
    game.locationAddress,
    game.locationLat,
    game.locationLng,
    game.locationPlaceId,
  ]);
  if (!game.location || !href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-white/70 text-base font-bold text-white hover:bg-white/10"
    >
      Directions ↗
    </a>
  );
}

const RESULT_CLASS = { W: "bg-green-600", L: "bg-red-600", T: "bg-slate-400" } as const;

function RecordCard({ data, today }: { data: AppData; today: string }) {
  const r = seasonRecord(data.games);
  const played = r.wins + r.losses + r.ties;
  const diff = r.runsFor - r.runsAgainst;
  const streak = r.streak
    ? `${{ W: "Won", L: "Lost", T: "Tied" }[r.streak.result]} ${r.streak.length}`
    : null;
  return (
    <Card title="Season" href="/games" linkText="Games">
      {played === 0 ? (
        <p className="text-base text-slate-600">No final scores yet.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="text-4xl leading-none font-black tracking-tight tabular-nums">
              {r.wins}–{r.losses}
              {r.ties > 0 && `–${r.ties}`}
            </p>
            {streak && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                {streak}
              </span>
            )}
          </div>
          <div
            className="mt-3 flex gap-1.5"
            aria-label={`Last ${r.lastFive.length}: ${r.lastFive.join(" ")}`}
          >
            {r.lastFive.map((x, i) => (
              <span
                key={i}
                className={`flex size-7 items-center justify-center rounded-md text-xs font-black text-white ${RESULT_CLASS[x]}`}
              >
                {x}
              </span>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Runs", r.runsFor],
              ["Allowed", r.runsAgainst],
              ["Diff", `${diff > 0 ? "+" : ""}${diff}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 py-2">
                <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                <dd className="text-lg font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {played > 1 && (
            <div className="mt-4">
              <RunsChart games={gameRuns(data.games)} year={Number(today.slice(0, 4))} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const TODO_DOT = { urgent: "bg-red-600", soon: "bg-amber-400", info: "bg-sky-500" } as const;

function TodoCard({ todos }: { todos: Todo[] }) {
  return (
    <Card title="To do">
      {todos.length === 0 ? (
        <p className="text-base text-slate-600">✓ You&apos;re all caught up.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {todos.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 text-[15px] text-slate-800 hover:bg-slate-50"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${TODO_DOT[t.level]}`}
                />
                <span className="min-w-0 flex-1">{t.text}</span>
                <span aria-hidden="true" className="text-slate-400">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The club's awards and this team's picks (coaches and managers), even once all are in. */
function AwardsCard({ data }: { data: AppData }) {
  const awards = data.clubAwards ?? [];
  const open = awards.filter((a) => a.open);
  const due = open.reduce<string | null>((d, a) => (!d || a.dueOn < d ? a.dueOn : d), null);
  const toPick = open.filter((a) => !a.playerId).length;
  return (
    <Card
      title="Club awards"
      href="/awards"
      linkText={toPick > 0 && isCoach(data.me.role) ? "Pick" : "Open"}
    >
      <ul className="-mx-2 flex flex-col">
        {awards.map((a) => {
          const winner = data.players.find((p) => p.id === a.playerId);
          return (
            <li key={a.awardId}>
              <Link
                href="/awards"
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-slate-50"
              >
                <span aria-hidden="true" className="text-xl">
                  {a.emoji || "🏅"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                  {a.name}
                </span>
                {winner ? (
                  <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 font-semibold text-green-900">
                    {winner.jerseyNumber != null ? `#${winner.jerseyNumber} ` : ""}
                    {winner.name}
                  </span>
                ) : a.open ? (
                  <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-sm font-bold text-amber-900">
                    To pick
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-slate-500">Closed</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-slate-600">
        {due ? `${toPick > 0 ? "Pick" : "You can change picks"} through ${dueText(due)}. ` : ""}
        🤫 Only {awards[0]!.clubName} sees these.
      </p>
    </Card>
  );
}

function ComingUpCard({ data, today }: { data: AppData; today: string }) {
  const items = comingUp(data.games, data.practices, today);
  return (
    <Card title="Coming up" href="/practices" linkText="Practice">
      {items.length === 0 ? (
        <p className="text-base text-slate-600">Nothing on the schedule.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((x) => {
            const d = new Date(`${x.date}T12:00:00`);
            const href = x.kind === "game" ? `/games/${x.game.id}` : `/practices/${x.practice.id}`;
            const title =
              x.kind === "game" ? `vs ${x.game.opponent}` : x.practice.focus || "Practice";
            const where = x.kind === "game" ? placeLabel(x.game) : x.practice.location;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <span
                    className={`flex w-12 shrink-0 flex-col items-center rounded-lg py-1 ${
                      x.kind === "game"
                        ? "bg-[var(--team)] text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span className="text-[10px] font-bold tracking-wide uppercase opacity-80">
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className="text-lg leading-none font-black">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">
                      {title}
                    </span>
                    <span className="block truncate text-sm text-slate-500">
                      {[
                        x.kind === "game" ? "Game" : "Practice",
                        x.time && formatClock(x.time),
                        where,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** How often each kid has sat this season, longest bars first; flags match the lineup rules. */
function PlayingTimeCard({ data }: { data: AppData }) {
  const config = resolveRuleConfig(data.season.fairPlayRules);
  const summary = seasonSummary(data.players, finalLineups(data, data.season.id), config);
  const rows = summary.rows
    .map((r) => ({ ...r, share: r.field + r.bench > 0 ? r.bench / (r.field + r.bench) : 0 }))
    .sort((a, b) => b.share - a.share);
  const avg = rows.length > 0 ? rows.reduce((n, r) => n + r.share, 0) / rows.length : 0;
  const max = Math.max(0.01, ...rows.map((r) => r.share));
  const flagged = rows.filter((r) => r.highBench || r.lowInfield).length;
  return (
    <Card title="Playing time" href="/season" linkText="Details" className="md:row-span-2">
      {summary.finalGames === 0 ? (
        <p className="text-base text-slate-600">Shows once a game is marked final.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Share of innings on the bench · {summary.finalGames} final game
            {summary.finalGames === 1 ? "" : "s"} ·{" "}
            {flagged > 0 ? (
              <span className="font-semibold text-amber-700">{flagged} to watch</span>
            ) : (
              <span className="font-semibold text-green-700">balanced</span>
            )}
          </p>
          <ul className="relative flex flex-col gap-1.5">
            {rows.map((r) => {
              const flag = r.highBench || r.lowInfield;
              return (
                <li key={r.player.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 truncate font-semibold text-slate-700">
                    {r.player.name.split(" ")[0]}
                  </span>
                  <span className="relative h-4 flex-1 rounded bg-slate-100">
                    <span
                      className={`absolute inset-y-0 left-0 rounded ${flag ? "bg-amber-400" : "bg-[var(--team)]/70"}`}
                      style={{ width: `${(r.share / max) * 100}%` }}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-[-3px] w-px bg-slate-500"
                      style={{ left: `${(avg / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-semibold text-slate-600 tabular-nums">
                    {Math.round(r.share * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Line: team average ({Math.round(avg * 100)}%). Amber: sits a lot, or short on infield.
          </p>
        </>
      )}
    </Card>
  );
}

function MoneyCard({ data, today }: { data: AppData; today: string }) {
  const seesAll = permissionsFor(data.me.role).seeAllMoney;
  if (seesAll) {
    const s = summaryToShow(data.financeEntries, data.financeSummary, true);
    const pct = s.billedCents > 0 ? Math.min(1, s.collectedCents / s.billedCents) : 0;
    return (
      <Card title="Money" href="/money">
        {s.billedCents === 0 && s.totalOutCents === 0 ? (
          <p className="text-base text-slate-600">No money entered yet.</p>
        ) : (
          <>
            <p className="text-3xl font-black tracking-tight tabular-nums">
              {formatCents(s.collectedCents)}
              <span className="text-base font-semibold text-slate-500">
                {" "}
                of {formatCents(s.billedCents)} collected
              </span>
            </p>
            <div className="mt-3 h-2.5 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold text-slate-500">Still owed</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatCents(Math.max(0, s.billedCents - s.collectedCents))}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold text-slate-500">Cash on hand</dt>
                <dd className="text-lg font-bold tabular-nums">{formatCents(s.cashOnHandCents)}</dd>
              </div>
            </dl>
          </>
        )}
      </Card>
    );
  }
  // Families: what they owe for their own kids.
  const me = myUserId(data);
  const kids = data.guardians.filter((g) => g.userId === me).map((g) => g.playerId);
  const ledgers = kids.map((id) =>
    playerLedger(id, data.financeEntries, data.financeShares, today),
  );
  const owed = ledgers.reduce((n, l) => n + Math.max(0, l.balanceCents), 0);
  const overdue = ledgers.reduce((n, l) => n + l.overdueCents, 0);
  const paid = ledgers.reduce((n, l) => n + Math.max(0, l.paidCents), 0);
  const nextDue = ledgers
    .map((l) => l.nextDue)
    .filter((n) => n !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return (
    <Card title="Money" href="/money">
      {owed <= 0 ? (
        <p className="text-lg font-bold text-green-700">✓ All paid up</p>
      ) : (
        <>
          <p
            className={`text-3xl font-black tracking-tight tabular-nums ${overdue > 0 ? "text-red-700" : ""}`}
          >
            {formatCents(owed)}
          </p>
          <p className="text-base text-slate-600">
            {overdue > 0 ? `${formatCents(overdue)} overdue` : "You owe"}
            {nextDue &&
              ` · next ${formatCents(nextDue.amountCents - nextDue.paidCents)} due ${shortDate(nextDue.dueDate)}`}
          </p>
        </>
      )}
      {paid + owed > 0 && <OwedPaidBars paid={paid} owed={owed} overdue={overdue} />}
    </Card>
  );
}

const PAID = "#0ca30c";
const OWED = "#ec835a";
const OVERDUE = "#d03b3b";

/**
 * Two bars, paid vs. still owed: amounts on top, names underneath. The overdue part of what's
 * owed is red at the bottom of its bar.
 */
function OwedPaidBars({ paid, owed, overdue }: { paid: number; owed: number; overdue: number }) {
  const max = Math.max(1, paid, owed);
  const px = (cents: number) => (cents / max) * 140;
  const late = Math.min(overdue, owed);
  return (
    <div
      role="img"
      aria-label={`Paid ${formatCents(paid)}, still owed ${formatCents(owed)}${late ? `, ${formatCents(late)} of it overdue` : ""}`}
      className="mt-5 flex flex-1 flex-col justify-end"
    >
      <div className="flex items-end justify-center gap-10 border-b border-slate-300">
        <div className="flex w-24 flex-col items-center">
          <span className="mb-1 text-sm font-bold text-slate-800 tabular-nums">
            {formatCents(paid)}
          </span>
          <span
            className="w-14 rounded-t-md"
            style={{ height: `${Math.max(3, px(paid))}px`, background: PAID }}
          />
        </div>
        <div className="flex w-24 flex-col items-center">
          <span className="mb-1 text-sm font-bold text-slate-800 tabular-nums">
            {formatCents(owed)}
          </span>
          <span className="flex w-14 flex-col overflow-hidden rounded-t-md">
            <span
              style={{ height: `${Math.max(owed ? 3 : 0, px(owed - late))}px`, background: OWED }}
            />
            {late > 0 && <span style={{ height: `${px(late)}px`, background: OVERDUE }} />}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-center gap-10 text-sm font-semibold text-slate-600">
        <span className="w-24 text-center">Paid</span>
        <span className="w-24 text-center">Still owed</span>
      </div>
      {late > 0 && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-slate-600">
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ background: OVERDUE }} />
          {formatCents(late)} overdue
        </p>
      )}
    </div>
  );
}

/** Families: homework still to do. */
function HomeworkCard({ data, today }: { data: AppData; today: string }) {
  const open = data.assignments.filter((a) => !a.dueDate || a.dueDate >= today);
  return (
    <Card title="Homework" href="/plays" linkText="Plays">
      {open.length === 0 ? (
        <p className="text-base text-slate-600">No homework right now.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {open.map((a) => {
            const s = homeworkStatus(a, data.quizResults, data.members, data.me.userId);
            return (
              <li key={a.id}>
                <Link
                  href={`/plays/homework/${a.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate text-[15px] font-semibold">{a.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      s.myBest ? TONE_CLASS.ready : TONE_CLASS.none
                    }`}
                  >
                    {s.myBest ? `Done ${s.myBest.correct}/${s.myBest.total}` : "To do"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
