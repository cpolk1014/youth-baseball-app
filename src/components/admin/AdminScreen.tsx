"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  PLAN_LABEL,
  PLAN_ORDER,
  ago,
  payingTeams,
  percent,
  readOverview,
  seasonRevenue,
  setupGap,
  type AdminOverview,
} from "@/lib/admin/overview";
import { formatCents } from "@/lib/finance/money";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { DailyBars } from "../charts/Charts";
import { PlanTab } from "./PlanTab";

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const h2 = "mb-3 text-sm font-bold tracking-wide text-slate-600 uppercase";
const dollars = (cents: number) => formatCents(Math.round(cents)).replace(/\.00$/, "");
const aiDollars = (cents: number) => formatCents(Math.round(cents));
const words = (kind: string) => kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const PURCHASE_LABEL: Record<string, string> = {
  club: "Club codes",
  team: "Team season",
  family: "Player pass",
};

/**
 * The admin panel (fungo.team/admin): how Fungo the business is doing. Only accounts on the
 * database's admin list get numbers; everyone else is told it isn't for them.
 */
export function AdminScreen() {
  const [o, setO] = useState<AdminOverview | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"numbers" | "plan">("numbers");
  // Bumped by Refresh so the Plan tab loads again too.
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setRound((r) => r + 1);
    const { data, error: err } = await getBrowserSupabase().rpc("admin_overview");
    if (err) {
      if (err.code === "42501") setState("denied");
      else {
        setError(err.message);
        setState("error");
      }
      return;
    }
    setO(readOverview(data));
    setState("ok");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this page's data
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[#1B2A4A] px-4 py-3 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img src="/brand/fungo-horizontal-white.svg" alt="Fungo" className="h-7 w-auto" />
        <span className="rounded-md bg-[#DC143C] px-2 py-0.5 text-sm font-bold">Admin</span>
        <span className="ml-auto hidden text-sm text-white/70 sm:block">
          {o && state === "ok"
            ? `Updated ${new Date(o.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : ""}
        </span>
        <button
          onClick={() => void load()}
          disabled={state === "loading"}
          className="h-10 rounded-lg border border-white/30 px-3 text-sm font-bold disabled:opacity-50"
        >
          {state === "loading" ? "Loading…" : "Refresh"}
        </button>
        <Link href="/" className="h-10 rounded-lg px-2 text-sm leading-10 font-semibold underline">
          App
        </Link>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        {state === "denied" && (
          <p className={`${card} text-lg`}>This page is for Fungo&apos;s admins.</p>
        )}
        {state === "error" && (
          <p role="alert" className={`${card} text-base font-semibold text-red-700`}>
            {error}
          </p>
        )}
        {o && state !== "denied" && (
          <>
            <div role="tablist" className="flex gap-1 self-start rounded-xl bg-slate-200 p-1">
              {(
                [
                  ["numbers", "Numbers"],
                  ["plan", "Plan"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`h-10 rounded-lg px-5 text-base font-bold ${tab === key ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "numbers" ? <Panel o={o} /> : <PlanTab key={round} />}
          </>
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-900 tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-sm text-slate-600">{note}</p>}
    </div>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-base text-slate-700">{label}</span>
      <span className="text-base font-bold tabular-nums">{value}</span>
    </li>
  );
}

function Panel({ o }: { o: AdminOverview }) {
  const paying = payingTeams(o);
  const tapRate = percent(o.shares.trialTaps30, o.shares.opens30);
  const maxPlan = Math.max(1, ...PLAN_ORDER.map((k) => o.teams.byPlan[k]));
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Revenue this season" value={dollars(seasonRevenue(o))} note="Since Aug 1" />
        <Tile label="Last 30 days" value={dollars(o.revenue.last30)} />
        <Tile label="Paying teams" value={paying} note={`of ${o.teams.total} teams`} />
        <Tile label="On a free trial" value={o.teams.byPlan.trial} />
        <Tile
          label="New teams"
          value={o.teams.new7}
          note={`this week · ${o.teams.new30} in 30 days`}
        />
        <Tile label="Active teams" value={o.teams.active14} note="a lineup or post in 14 days" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <h2 className={h2}>Money</h2>
          <ul>
            <Row label="Club codes (season)" value={dollars(o.revenue.season.club)} />
            <Row label="Team seasons (season)" value={dollars(o.revenue.season.team)} />
            <Row label="Player passes (season)" value={dollars(o.revenue.season.family)} />
            <Row label="All time" value={dollars(o.revenue.allTime)} />
            <Row
              label="Player passes active"
              value={`${o.revenue.playerPasses} (${o.revenue.playerPassKids} kids)`}
            />
            <Row label="Club codes used" value={`${o.clubs.codesUsed} of ${o.clubs.codesSold}`} />
            <Row label="Clubs" value={o.clubs.total} />
          </ul>
        </section>

        <section className={card}>
          <h2 className={h2}>Teams by plan</h2>
          <ul className="flex flex-col gap-2">
            {PLAN_ORDER.map((k) => (
              <li key={k}>
                <div className="flex justify-between text-base">
                  <span className="text-slate-700">{PLAN_LABEL[k]}</span>
                  <span className="font-bold tabular-nums">{o.teams.byPlan[k]}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-[#2a78d6]"
                    style={{ width: `${(o.teams.byPlan[k] / maxPlan) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className={h2}>People</h2>
          <ul>
            <Row label="Accounts" value={o.users.total} />
            <Row label="New this week" value={o.users.new7} />
            <Row label="New in 30 days" value={o.users.new30} />
            <Row label="Signed in this week" value={o.users.active7} />
            <Row label="Coaches and managers" value={o.users.coaches} />
            <Row label="Parents" value={o.users.parents} />
          </ul>
        </section>
      </div>

      <section className={card}>
        <h2 className={h2}>Last 30 days</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-1 text-base font-semibold">New teams</p>
            <DailyBars
              label="New teams per day"
              points={o.daily.map((d) => ({ day: d.day, value: d.teams }))}
              format={(v) => `${v} team${v === 1 ? "" : "s"}`}
            />
          </div>
          <div>
            <p className="mb-1 text-base font-semibold">New accounts</p>
            <DailyBars
              label="New accounts per day"
              points={o.daily.map((d) => ({ day: d.day, value: d.users }))}
              format={(v) => `${v} account${v === 1 ? "" : "s"}`}
            />
          </div>
          <div>
            <p className="mb-1 text-base font-semibold">Money in</p>
            <DailyBars
              label="Money in per day"
              points={o.daily.map((d) => ({ day: d.day, value: d.cents }))}
              format={dollars}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className={h2}>Getting found</h2>
          <ul>
            <Row label="Demo clubs started this week" value={o.demo.starts7} />
            <Row label="Demo clubs started in 30 days" value={o.demo.starts30} />
            <Row label="Demo clubs open now" value={o.demo.live} />
            <Row label="Tournaments shared now" value={o.shares.live} />
            <Row label="Share link opens (30 days)" value={o.shares.opens30} />
            <Row
              label="Trial taps from share links"
              value={`${o.shares.trialTaps30}${tapRate !== null ? ` (${tapRate}%)` : ""}`}
            />
          </ul>
          {o.shares.top.length > 0 && (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-1 pr-2">Shared tournament</th>
                  <th className="py-1 pr-2 text-right">Opens</th>
                  <th className="py-1 text-right">Trial taps</th>
                </tr>
              </thead>
              <tbody>
                {o.shares.top.map((s) => (
                  <tr key={`${s.team}-${s.tournament}`} className="border-t border-slate-100">
                    <td className="py-1 pr-2">
                      {s.tournament} <span className="text-slate-500">· {s.team}</span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.opens}</td>
                    <td className="py-1 text-right tabular-nums">{s.trialTaps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={card}>
          <h2 className={h2}>AI spending</h2>
          <ul>
            <Row label="Last 30 days" value={aiDollars(o.ai.cents30)} />
            <Row label="This season" value={aiDollars(o.ai.centsSeason)} />
            <Row label="Ask Fungo (30 days)" value={aiDollars(o.ask.cents30)} />
          </ul>
          {o.ai.byKind30.length > 0 && (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-1 pr-2">Feature (30 days)</th>
                  <th className="py-1 pr-2 text-right">Calls</th>
                  <th className="py-1 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {o.ai.byKind30.map((k) => (
                  <tr key={k.kind} className="border-t border-slate-100">
                    <td className="py-1 pr-2">{words(k.kind)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{k.calls}</td>
                    <td className="py-1 text-right tabular-nums">{aiDollars(k.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {o.ai.topTeams30.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">
              Top teams: {o.ai.topTeams30.map((t) => `${t.name} ${aiDollars(t.cents)}`).join(" · ")}
            </p>
          )}
        </section>
      </div>

      <section className={card}>
        <h2 className={h2}>Newest teams</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="py-1 pr-3">Team</th>
                <th className="py-1 pr-3">Started</th>
                <th className="py-1 pr-3">Plan</th>
                <th className="py-1 pr-3 text-right">Players</th>
                <th className="py-1 pr-3 text-right">Games</th>
                <th className="py-1 pr-3 text-right">Lineups</th>
                <th className="py-1 pr-3 text-right">Families</th>
                <th className="py-1 pr-3">Last active</th>
                <th className="py-1 pr-3">Needs</th>
                <th className="py-1">Owner</th>
              </tr>
            </thead>
            <tbody>
              {o.recentTeams.map((t) => {
                const gap = setupGap(t);
                return (
                  <tr key={t.id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3">
                      <span className="font-semibold">{t.name}</span>{" "}
                      <span className="text-slate-500">{t.ageGroup}</span>
                      {t.club && <span className="block text-slate-500">{t.club}</span>}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{ago(t.createdAt)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{PLAN_LABEL[t.plan]}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.players}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.games}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.lineups}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.parents}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{ago(t.lastActive)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {gap ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                          {gap}
                        </span>
                      ) : (
                        <span className="text-green-700">✓ Going</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {t.ownerEmail ? (
                        <a href={`mailto:${t.ownerEmail}`} className="text-[#1B2A4A] underline">
                          {t.ownerEmail}
                        </a>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className={h2}>Recent purchases</h2>
          {o.recentPurchases.length === 0 ? (
            <p className="text-base text-slate-600">None yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody>
                {o.recentPurchases.map((p, i) => (
                  <tr key={i} className="border-t border-slate-100 first:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{ago(p.createdAt)}</td>
                    <td className="py-1.5 pr-2">
                      {PURCHASE_LABEL[p.kind] ?? p.kind}
                      {p.quantity > 1 ? ` ×${p.quantity}` : ""}
                      {p.what && <span className="text-slate-500"> · {p.what}</span>}
                      {p.buyerEmail && <span className="block text-slate-500">{p.buyerEmail}</span>}
                    </td>
                    <td className="py-1.5 text-right font-bold tabular-nums">
                      {dollars(p.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={card}>
          <h2 className={h2}>
            Ask Fungo · {o.ask.questions7} this week, {o.ask.questions30} in 30 days
          </h2>
          {o.ask.recent.length === 0 ? (
            <p className="text-base text-slate-600">No questions yet.</p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {o.ask.recent.map((q, i) => (
                <li key={i} className="border-t border-slate-100 py-1.5 text-sm first:border-0">
                  <span className="text-slate-500">{ago(q.askedAt)}</span>
                  {q.page && <span className="text-slate-400"> · {q.page}</span>}
                  {q.outcome !== "answered" && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">
                      {words(q.outcome)}
                    </span>
                  )}
                  <span className="block text-base text-slate-800">{q.question}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
