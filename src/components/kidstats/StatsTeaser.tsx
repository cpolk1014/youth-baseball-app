"use client";

import { useMemo } from "react";
import { FAMILY_FROM_CENTS } from "@/lib/billing/family";
import { dollars } from "@/lib/billing/season";
import { sampleCareer } from "@/lib/boxscore/sample";
import { rate, seasonTotals } from "@/lib/boxscore/stats";
import { battingTrend, pitchingTrend } from "@/lib/boxscore/trends";
import { yearsOf } from "@/lib/boxscore/years";
import type { Player } from "@/lib/rules/types";
import { StrikeChart, TrendChart } from "../charts/Charts";
import { RedeemCode } from "./familyPass";

/**
 * What a parent who hasn't unlocked stats sees: three made-up seasons, blurred and labeled
 * as a sample, so they can see what they'd get, and the way to unlock it.
 */
export function StatsTeaser({
  kid,
  year,
  onUpgrade,
  redeem,
}: {
  kid: Player;
  year: number;
  onUpgrade: () => void;
  redeem: (code: string) => Promise<void>;
}) {
  const games = useMemo(() => sampleCareer(year), [year]);
  const t = seasonTotals(games);
  const first = kid.name.split(" ")[0];
  const tile = (label: string, value: string | number) => (
    <div className="flex flex-col items-center rounded-lg bg-slate-50 px-2 py-2">
      <span className="text-2xl font-black tabular-nums">{value}</span>
      <span className="text-xs font-bold tracking-wide text-slate-600 uppercase">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border-2 border-[var(--team)] bg-white p-4">
        <h2 className="text-xl font-black">Follow {first}&apos;s stats, season after season</h2>
        <ul className="mt-2 flex flex-col gap-1 text-base text-slate-700">
          <li>
            ✓ Import each game&apos;s GameChanger box score; AVG, OBP, OPS and pitching add up
          </li>
          <li>✓ Charts of how {first} is trending, game by game and year over year</li>
          <li>✓ Stays with {first} on every team, and a shareable player card</li>
          <li>✓ Private: only {first}&apos;s parents see it</li>
        </ul>
        <button
          onClick={onUpgrade}
          className="mt-3 flex h-14 w-full items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
        >
          Upgrade · from {dollars(FAMILY_FROM_CENTS)} a season
        </button>
      </section>

      {/* A sample, blurred: not this kid's numbers. */}
      <div className="relative overflow-hidden rounded-xl">
        <span className="absolute top-2 left-2 z-10 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
          Sample stats
        </span>
        <div
          aria-hidden
          className="pointer-events-none flex flex-col gap-4 blur-[3px] select-none md:grid md:grid-cols-2 md:items-start"
        >
          <section className="rounded-xl border-2 border-slate-200 bg-white p-3 md:col-span-2">
            <div className="mb-3 flex flex-wrap gap-2 pt-6">
              {["All years", ...yearsOf(games).map(String)].map((y, i) => (
                <span
                  key={y}
                  className={`flex h-10 items-center rounded-full px-4 text-base font-bold ${i === 0 ? "bg-[var(--team)] text-white" : "border-2 border-slate-300"}`}
                >
                  {y}
                </span>
              ))}
            </div>
            <p className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
              3 seasons · {t.games} games
            </p>
            <div className="grid grid-cols-4 gap-2">
              {tile("AVG", rate(t.batting.avg))}
              {tile("OBP", rate(t.batting.obp))}
              {tile("SLG", rate(t.batting.slg))}
              {tile("OPS", rate(t.batting.ops))}
            </div>
          </section>
          <TrendChart points={battingTrend(games)} year={year} />
          <StrikeChart points={pitchingTrend(games)} year={year} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-white via-white/80 to-transparent px-4 pt-16 pb-4">
          <button
            onClick={onUpgrade}
            className="h-12 rounded-xl bg-[var(--team)] px-6 text-base font-bold text-white shadow-lg"
          >
            Unlock {first}&apos;s stats
          </button>
        </div>
      </div>

      <section className="rounded-xl border-2 border-slate-200 bg-white p-3">
        <RedeemCode redeem={redeem} />
      </section>
    </div>
  );
}
