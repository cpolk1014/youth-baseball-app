"use client";

import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import { myUserId, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { playerLedger, type MoneySummary, type PlayerLedger } from "@/lib/finance/ledger";
import { formatCents, shortDate } from "@/lib/finance/money";
import { useToday } from "./useToday";

const row = "flex items-baseline justify-between gap-3 py-1 text-base";

/** Team totals everyone sees: money in, money out, left over, collected, cash on hand. */
export function MoneySummaryCard({ s }: { s: MoneySummary }) {
  const pct = s.billedCents > 0 ? Math.round((s.collectedCents / s.billedCents) * 100) : null;
  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Money in</h3>
          <p className={row}>
            <span>Bat Arounds</span>
            <span>{formatCents(s.batAroundCents)}</span>
          </p>
          <p className={row}>
            <span>Cleanups</span>
            <span>{formatCents(s.cleanupCents)}</span>
          </p>
          <p className={row}>
            <span>Grand Slams</span>
            <span>{formatCents(s.grandSlamCents)}</span>
          </p>
          <p className={`${row} border-t-2 border-slate-200 font-bold`}>
            <span>Total in</span>
            <span>{formatCents(s.totalInCents)}</span>
          </p>
        </div>
        <div>
          <h3 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Money out</h3>
          <p className={row}>
            <span>Rain Checks</span>
            <span>{formatCents(s.rainCheckCents)}</span>
          </p>
          <p className={row}>
            <span>Walkoffs</span>
            <span>{formatCents(s.walkoffCents)}</span>
          </p>
          <p className={`${row} border-t-2 border-slate-200 font-bold`}>
            <span>Total out</span>
            <span>{formatCents(s.totalOutCents)}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-baseline justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 text-lg font-bold">
        <span>Left over once everyone pays</span>
        <span className={s.leftOverCents < 0 ? "text-red-700" : ""}>
          {formatCents(s.leftOverCents)}
        </span>
      </p>
      <div className="mt-3">
        <h3 className="text-sm font-bold tracking-wide text-slate-600 uppercase">
          Collected so far
        </h3>
        <p className="text-base">
          Families have paid <strong>{formatCents(s.collectedCents)}</strong> of{" "}
          {formatCents(s.billedCents)}
          {pct !== null && ` (${pct}%)`}
        </p>
        <p className={`${row} font-bold`}>
          <span>Cash on hand</span>
          <span className={s.cashOnHandCents < 0 ? "text-red-700" : ""}>
            {formatCents(s.cashOnHandCents)}
          </span>
        </p>
      </div>
      {(s.plannedOutCents > 0 || s.expectedInCents > 0) && (
        <div className="mt-2 text-base text-slate-700">
          {s.plannedOutCents > 0 && <p>Planned, not paid yet: {formatCents(s.plannedOutCents)}</p>}
          {s.expectedInCents > 0 && (
            <p>Expected in, not received yet: {formatCents(s.expectedInCents)}</p>
          )}
        </div>
      )}
    </section>
  );
}

/** One family's balance with what's due next; links to their full account. */
export function FamilyCard({
  name,
  playerId,
  ledger,
  year,
}: {
  name: string;
  playerId: string;
  ledger: PlayerLedger;
  year: number;
}) {
  const owes = ledger.balanceCents > 0;
  return (
    <Link
      href={`/money/${playerId}`}
      className="flex h-full min-h-16 items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold">{name}</span>
        <span className="block text-sm text-slate-600">
          {ledger.nextDue
            ? `Next: ${formatCents(ledger.nextDue.amountCents - ledger.nextDue.paidCents)} due ${shortDate(ledger.nextDue.dueDate, year)}`
            : ledger.balanceCents < 0
              ? "Credit on account"
              : "All paid up"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`block text-lg font-bold ${ledger.overdueCents > 0 ? "text-red-700" : owes ? "" : "text-green-800"}`}
        >
          {formatCents(Math.abs(ledger.balanceCents))}
        </span>
        <span className="block text-xs font-semibold text-slate-600">
          {ledger.overdueCents > 0
            ? `${formatCents(ledger.overdueCents)} overdue`
            : owes
              ? "owes"
              : ledger.balanceCents < 0
                ? "credit"
                : "paid"}
        </span>
      </span>
    </Link>
  );
}

/** Players the viewer can see money for: everyone for treasurers, their own kids otherwise. */
export function moneyPlayers(data: AppData, seesAll: boolean, myKidIds: string[]) {
  return data.players.filter((p) =>
    seesAll
      ? p.active !== false || data.financeShares.some((s) => s.playerId === p.id)
      : myKidIds.includes(p.id),
  );
}

/** For families: a reminder at the top of Games when they owe money. */
export function MoneyNudge() {
  const data = useAppData();
  const today = useToday();
  if (!data || permissionsFor(data.me.role).seeAllMoney) return null;
  const me = myUserId(data);
  const kids = data.guardians.filter((g) => g.userId === me).map((g) => g.playerId);
  const ledgers = kids.map((id) =>
    playerLedger(id, data.financeEntries, data.financeShares, today),
  );
  const owed = ledgers.reduce((sum, l) => sum + Math.max(0, l.balanceCents), 0);
  if (owed <= 0) return null;
  const overdue = ledgers.reduce((sum, l) => sum + l.overdueCents, 0);
  const next = ledgers
    .map((l) => l.nextDue)
    .filter((n) => n !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return (
    <Link
      href="/money"
      className={`mb-4 flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${overdue > 0 ? "border-red-700 bg-red-50" : "border-amber-400 bg-amber-50"}`}
    >
      <span>
        <span className="block text-lg font-bold">
          {overdue > 0 ? `${formatCents(overdue)} overdue` : `You owe ${formatCents(owed)}`}
        </span>
        {next && (
          <span className="block text-base">
            Next: {formatCents(next.amountCents - next.paidCents)} due {shortDate(next.dueDate)}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-2xl">
        ›
      </span>
    </Link>
  );
}
