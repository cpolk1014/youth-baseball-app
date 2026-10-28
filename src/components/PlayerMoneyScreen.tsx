"use client";

import { useState } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { myUserId, useAppData } from "@/lib/data/store";
import { playerLedger, type InstallmentStatus } from "@/lib/finance/ledger";
import { formatCents, shortDate } from "@/lib/finance/money";
import { ENTRY_LABEL, isCharge, type FinanceEntry } from "@/lib/finance/types";
import { AppShell, Loading } from "./AppShell";
import { MoneyEntryForm, newEntry } from "./MoneyEntryForm";
import { Sheet } from "./Sheet";
import { useToday } from "./useToday";

const STATUS: Record<InstallmentStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-700 text-white" },
  partial: { label: "Part paid", className: "bg-amber-300 text-slate-900" },
  due: { label: "Due", className: "bg-slate-200 text-slate-800" },
  overdue: { label: "Overdue", className: "bg-red-700 text-white" },
};

/** One player's account: charges with installments, payments and credits. */
export function PlayerMoneyScreen({ playerId }: { playerId: string }) {
  const data = useAppData();
  const today = useToday();
  const [editing, setEditing] = useState<{ entry: FinanceEntry; isNew: boolean } | null>(null);

  if (!data) {
    return (
      <AppShell title="Family account" backHref="/money" tab="money">
        <Loading />
      </AppShell>
    );
  }
  const player = data.players.find((p) => p.id === playerId);
  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  const year = Number(today.slice(0, 4));
  const ledger = playerLedger(playerId, data.financeEntries, data.financeShares, today);
  const myShares = data.financeShares.filter((s) => s.playerId === playerId);
  const entryOf = (id: string) => data.financeEntries.find((e) => e.id === id);
  const charges = myShares
    .map((s) => ({ share: s, entry: entryOf(s.entryId) }))
    .filter(
      (x): x is { share: typeof x.share; entry: FinanceEntry } =>
        !!x.entry && isCharge(x.entry.type),
    )
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));
  const others = myShares
    .map((s) => ({ share: s, entry: entryOf(s.entryId) }))
    .filter(
      (x): x is { share: typeof x.share; entry: FinanceEntry } =>
        !!x.entry && !isCharge(x.entry.type),
    )
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date));
  const splitWays = (entryId: string) =>
    data.financeShares.filter((s) => s.entryId === entryId).length;

  const mine = data.guardians.some((g) => g.playerId === playerId && g.userId === myUserId(data));
  if (!player || (!perms.seeAllMoney && !mine)) {
    return (
      <AppShell title="Family account" backHref="/money" tab="money">
        <p className="text-lg">There&apos;s no account to show here.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={player.name} subtitle="Family account" backHref="/money" tab="money">
      <section className="mb-5 rounded-xl border-2 border-slate-200 bg-white p-4">
        <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">
          {ledger.balanceCents < 0 ? "Credit" : "Balance"}
        </p>
        <p
          className={`text-4xl font-bold ${ledger.overdueCents > 0 ? "text-red-700" : ledger.balanceCents <= 0 ? "text-green-800" : ""}`}
        >
          {formatCents(Math.abs(ledger.balanceCents))}
        </p>
        {ledger.overdueCents > 0 && (
          <p className="text-base font-semibold text-red-700">
            {formatCents(ledger.overdueCents)} overdue
          </p>
        )}
        {ledger.nextDue ? (
          <p className="text-base">
            Next: {formatCents(ledger.nextDue.amountCents - ledger.nextDue.paidCents)} due{" "}
            {shortDate(ledger.nextDue.dueDate, year)}
          </p>
        ) : (
          <p className="text-base">
            {ledger.balanceCents < 0 ? "The team owes this family." : "All paid up."}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-600">
          Charged {formatCents(ledger.chargedCents)} · Paid {formatCents(ledger.paidCents)}
          {ledger.creditCents > 0 && ` · Credits ${formatCents(ledger.creditCents)}`}
        </p>
        {perms.editMoney && (
          <button
            onClick={() =>
              setEditing({ entry: newEntry("safe_at_home", data.season.id, today), isNew: true })
            }
            className="mt-3 h-12 w-full rounded-xl bg-green-700 text-base font-bold text-white active:bg-green-800"
          >
            Record a payment
          </button>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">Charges</h2>
        {charges.length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            No charges yet.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {charges.map(({ share, entry }) => {
              const parts = ledger.installments.filter((i) => i.entryId === entry.id);
              return (
                <li key={entry.id} className="rounded-xl border-2 border-slate-200 bg-white p-3">
                  <button
                    disabled={!perms.editMoney}
                    onClick={() => setEditing({ entry, isNew: false })}
                    className="w-full text-left"
                  >
                    <span className="block text-xs font-bold tracking-wide text-slate-500 uppercase">
                      {ENTRY_LABEL[entry.type]}
                    </span>
                    <span className="block text-lg font-semibold">{entry.title}</span>
                    <span className="block text-base">
                      {entry.type === "bat_around" ? (
                        <>
                          Your share <strong>{formatCents(share.amountCents)}</strong> of{" "}
                          {formatCents(entry.amountCents)}{" "}
                          <span className="text-slate-600">(split {splitWays(entry.id)} ways)</span>
                        </>
                      ) : (
                        <strong>{formatCents(share.amountCents)}</strong>
                      )}
                    </span>
                  </button>
                  <ul className="mt-2 flex flex-col gap-1">
                    {parts.map((i) => (
                      <li key={i.number} className="flex items-center gap-2 text-base">
                        <span className="flex-1">
                          {parts.length > 1 ? `${i.number} of ${i.of} · ` : ""}
                          {shortDate(i.dueDate, year)}
                        </span>
                        <span className="font-semibold">{formatCents(i.amountCents)}</span>
                        <span
                          className={`w-20 rounded-md px-1 py-0.5 text-center text-xs font-bold ${STATUS[i.status].className}`}
                        >
                          {STATUS[i.status].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          Payments and credits
        </h2>
        {others.length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            None yet.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {others.map(({ entry }) => (
              <li key={entry.id}>
                <button
                  disabled={!perms.editMoney}
                  onClick={() => setEditing({ entry, isNew: false })}
                  className="flex h-full min-h-14 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold tracking-wide text-slate-500 uppercase">
                      {entry.refund ? "Money back" : ENTRY_LABEL[entry.type]}
                    </span>
                    <span className="block truncate text-base font-semibold">{entry.title}</span>
                    <span className="block text-sm text-slate-600">
                      {shortDate(entry.date, year)}
                      {entry.method && ` · ${entry.method}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-bold">
                    {entry.refund ? "-" : ""}
                    {formatCents(entry.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet
        open={editing !== null}
        title={
          editing ? `${editing.isNew ? "Add" : "Edit"} ${ENTRY_LABEL[editing.entry.type]}` : ""
        }
        onClose={() => setEditing(null)}
      >
        {editing && (
          <MoneyEntryForm
            key={editing.entry.id}
            entry={editing.entry}
            isNew={editing.isNew}
            presetPlayerId={playerId}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
