"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatGameDate, gameContext } from "@/lib/data/game";
import { useAppData } from "@/lib/data/store";
import { buildLineupCard } from "@/lib/lineup/card";
import { validateLineup } from "@/lib/rules/validate";
import { AppShell, Loading } from "./AppShell";
import { LineupCardPage, type CardSize } from "./LineupCard";

const PAGE_WIDTH_PX = 816; // 8.5in at 96dpi

// Both sizes print on letter paper; the card supplies its own margins.
const PAGE_RULE = "@page { size: letter portrait; margin: 0; }";

export function LineupCardScreen({ gameId }: { gameId: string }) {
  const data = useAppData();
  const [size, setSize] = useState<CardSize>("half");
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / PAGE_WIDTH_PX));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  const back = `/games/${gameId}`;
  if (!data) {
    return (
      <AppShell title="Lineup card" backHref={back} tab="games">
        <Loading />
      </AppShell>
    );
  }
  const ctx = gameContext(data, gameId);
  if (!ctx) {
    return (
      <AppShell title="Game not found" backHref="/games" tab="games">
        <p className="text-lg">This game doesn&apos;t exist.</p>
      </AppShell>
    );
  }

  const { game, config, lineup, history } = ctx;
  const card = buildLineupCard(data.players, lineup, config.fieldPositions);
  const blocks = validateLineup(data.players, lineup, config, history).filter(
    (v) => v.severity === "block",
  ).length;
  const header = {
    team: data.team.name,
    ageGroup: data.team.ageGroup,
    opponent: game.opponent,
    when: formatGameDate(game),
    location: game.location,
  };

  return (
    <AppShell title="Lineup card" subtitle={`vs ${game.opponent}`} backHref={back} tab="games">
      <style>{PAGE_RULE}</style>

      <div className="mb-3 flex flex-col gap-3 print:hidden">
        <div
          role="radiogroup"
          aria-label="Paper size"
          className="grid grid-cols-2 rounded-xl border-2 border-[#0b1f3a] p-1"
        >
          {(
            [
              ["half", "Half sheet ×2"],
              ["letter", "Full letter"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={size === value}
              onClick={() => setSize(value)}
              className={`h-11 rounded-lg text-base font-bold ${size === value ? "bg-[#0b1f3a] text-white" : "text-[#0b1f3a]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {(!card.complete || blocks > 0) && (
          <p className="rounded-xl border-2 border-red-700 bg-red-50 p-3 text-base font-semibold text-red-900">
            {!card.complete ? "Some spots are still empty. " : ""}
            {blocks > 0 ? `${blocks} fair-play problem${blocks === 1 ? "" : "s"} to fix. ` : ""}
            <Link href={back} className="underline">
              Back to lineup
            </Link>
          </p>
        )}

        <button
          onClick={() => window.print()}
          className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800"
        >
          Print
        </button>
        <p className="text-sm text-slate-600">
          {size === "half"
            ? "Prints two copies on one letter page. Cut on the dashed line: one for the umpire, one for the dugout."
            : "One full page with a defense-by-inning chart for the dugout."}
        </p>
      </div>

      <div ref={frame} className="w-full print:w-auto">
        <div
          className="overflow-hidden shadow-lg ring-1 ring-slate-300 print:h-auto! print:w-auto! print:overflow-visible print:shadow-none print:ring-0"
          style={{ width: PAGE_WIDTH_PX * scale, height: 1056 * scale }}
        >
          <div
            className="print-page"
            style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            <LineupCardPage size={size} header={header} data={card} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
