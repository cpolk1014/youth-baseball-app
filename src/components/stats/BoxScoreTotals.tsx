"use client";

import Link from "next/link";
import { outsToInnings, rate, seasonTotals } from "@/lib/boxscore/stats";
import type { AppData } from "@/lib/data/types";
import { useSeasonBoxScores } from "../boxscore/boxData";

/** The season added up from the team's box scores (one per game, added on each game's page). */
export function BoxScoreTotals({ data }: { data: AppData }) {
  const box = useSeasonBoxScores(data.season.id);
  const lines = box.lines.filter((l) => l.playerId);
  const games = new Set(lines.filter((l) => !l.pitchOnly).map((l) => l.gameId)).size;
  if (box.loading || lines.length === 0) {
    return box.loading ? null : (
      <p className="mt-6 text-base text-slate-600">
        Box scores: add GameChanger&apos;s box score on each game&apos;s page after the game, and
        the season adds up here (pitch counts too).
      </p>
    );
  }
  const rows = data.players
    .map((p) => ({ p, t: seasonTotals(lines.filter((l) => l.playerId === p.id)) }))
    .filter(({ t }) => t.games > 0 || t.pitching)
    .sort((a, b) => (b.t.batting.ops ?? -1) - (a.t.batting.ops ?? -1));
  const th = "px-2 py-2 text-right text-sm font-bold text-slate-600";
  const td = "px-2 py-2 text-right tabular-nums";
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
        From box scores · {games} game{games === 1 ? "" : "s"}
      </h2>
      <p className="mb-2 text-sm text-slate-600">
        Added on each game&apos;s page.{" "}
        <Link href="/games" className="underline">
          Games
        </Link>
      </p>
      <div className="overflow-x-auto rounded-xl border-2 border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-base">
          <thead className="border-b-2 border-slate-200">
            <tr>
              <th className="px-2 py-2 text-left text-sm font-bold text-slate-600">Player</th>
              {["G", "PA", "AVG", "OBP", "SLG", "OPS", "IP", "Pitches", "WHIP"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, t }) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 font-semibold">{p.name}</td>
                <td className={td}>{t.games}</td>
                <td className={td}>{t.batting.pa}</td>
                <td className={td}>{rate(t.batting.avg)}</td>
                <td className={td}>{rate(t.batting.obp)}</td>
                <td className={td}>{rate(t.batting.slg)}</td>
                <td className={td}>{rate(t.batting.ops)}</td>
                <td className={td}>{t.pitching?.outs ? outsToInnings(t.pitching.outs) : "–"}</td>
                <td className={td}>{t.pitching?.pitches || "–"}</td>
                <td className={td}>
                  {t.pitching?.whip != null ? t.pitching.whip.toFixed(2) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
