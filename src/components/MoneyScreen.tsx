"use client";

import { useState } from "react";
import Link from "next/link";
import { permissionsFor } from "@/lib/data/permissions";
import { myUserId, useAppData } from "@/lib/data/store";
import { summaryToShow } from "@/lib/finance/entry";
import { playerLedger } from "@/lib/finance/ledger";
import { formatCents, shortDate } from "@/lib/finance/money";
import { ENTRY_LABEL, ENTRY_TYPES, type EntryType, type FinanceEntry } from "@/lib/finance/types";
import { AppShell, Loading } from "./AppShell";
import { kidsOf } from "./KidPicker";
import { EntryTypePicker, MoneyEntryForm, newEntry } from "./MoneyEntryForm";
import { FamilyCard, MoneySummaryCard, moneyPlayers } from "./MoneyParts";
import { openReceipt } from "./receiptFile";
import { Sheet } from "./Sheet";
import { useToday } from "./useToday";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

export function MoneyScreen() {
  const data = useAppData();
  const today = useToday();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ entry: FinanceEntry; isNew: boolean } | null>(null);
  const [filter, setFilter] = useState<EntryType | "all">("all");

  if (!data) {
    return (
      <AppShell title="Team money" tab="money">
        <Loading />
      </AppShell>
    );
  }

  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  const year = Number(today.slice(0, 4));
  const myKids = kidsOf(data, myUserId(data));
  const summary = summaryToShow(data.financeEntries, data.financeSummary, perms.seeAllMoney);
  const families = moneyPlayers(
    data,
    perms.seeAllMoney,
    myKids.map((p) => p.id),
  ).map((p) => ({
    player: p,
    ledger: playerLedger(p.id, data.financeEntries, data.financeShares, today),
  }));
  const entries = [...data.financeEntries].sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  );
  const shown = entries.filter((e) => filter === "all" || e.type === filter);
  const walkoffs = entries.filter((e) => e.type === "walkoff");
  const tagged = (e: FinanceEntry) => {
    const shares = data.financeShares.filter((s) => s.entryId === e.id);
    if (e.type === "bat_around") return `split ${shares.length} ways`;
    const p = data.players.find((x) => x.id === shares[0]?.playerId);
    return p?.name ?? (e.type === "walkoff" ? (e.payee ?? "") : "");
  };

  return (
    <AppShell
      title="Team money"
      subtitle={`${data.team.name} · ${data.season.name}`}
      backHref="/roster"
      tab="money"
      action={
        perms.editMoney ? (
          <button
            onClick={() => setPicking(true)}
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[#0b1f3a] active:bg-slate-200"
          >
            + Add
          </button>
        ) : undefined
      }
    >
      {!perms.seeAllMoney && (
        <section className="mb-5">
          <h2 className={heading}>My family</h2>
          {families.length === 0 ? (
            <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
              Link your player to see what you owe.{" "}
              <Link href="/members" className="font-semibold text-[#0b1f3a] underline">
                Pick your player
              </Link>
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {families.map(({ player, ledger }) => (
                <li key={player.id}>
                  <FamilyCard name={player.name} playerId={player.id} ledger={ledger} year={year} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-5">
        <h2 className={heading}>Team totals</h2>
        <MoneySummaryCard s={summary} />
      </section>

      {perms.seeAllMoney && (
        <section className="mb-5">
          <h2 className={heading}>Families</h2>
          {families.length === 0 ? (
            <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
              Add players on the Roster tab first.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {families
                .sort(
                  (a, b) =>
                    b.ledger.overdueCents - a.ledger.overdueCents ||
                    b.ledger.balanceCents - a.ledger.balanceCents ||
                    a.player.name.localeCompare(b.player.name),
                )
                .map(({ player, ledger }) => (
                  <li key={player.id}>
                    <FamilyCard
                      name={player.name}
                      playerId={player.id}
                      ledger={ledger}
                      year={year}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-5">
        <h2 className={heading}>
          {perms.seeAllMoney ? "Entries" : "Walkoffs: where team money went"}
        </h2>
        {perms.seeAllMoney && (
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {(["all", ...ENTRY_TYPES] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                aria-pressed={filter === t}
                className={`h-10 shrink-0 rounded-full border-2 px-4 text-base font-semibold ${
                  filter === t
                    ? "border-[#0b1f3a] bg-[#0b1f3a] text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                {t === "all" ? "All" : ENTRY_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        {(perms.seeAllMoney ? shown : walkoffs).length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            {perms.editMoney ? "Nothing yet. Tap + Add to record the first one." : "None yet."}
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {(perms.seeAllMoney ? shown : walkoffs).map((e) => {
              const Tag = perms.editMoney ? "button" : "div";
              return (
                <li key={e.id}>
                  <Tag
                    onClick={
                      perms.editMoney ? () => setEditing({ entry: e, isNew: false }) : undefined
                    }
                    className={`flex h-full min-h-16 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left ${perms.editMoney ? "active:bg-slate-50" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold tracking-wide text-slate-500 uppercase">
                        {ENTRY_LABEL[e.type]}
                        {e.estimate && " · estimate"}
                        {e.refund && " · money back"}
                      </span>
                      <span className="block truncate text-base font-semibold">{e.title}</span>
                      <span className="block truncate text-sm text-slate-600">
                        {e.receiptPath && (
                          <span aria-label="Has a receipt" title="Has a receipt">
                            📎{" "}
                          </span>
                        )}
                        {shortDate(e.date, year)}
                        {tagged(e) && ` · ${tagged(e)}`}
                        {e.dueDates.length > 1 && ` · ${e.dueDates.length} payments`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-bold">{formatCents(e.amountCents)}</span>
                      {!perms.editMoney && e.receiptPath && (
                        <button
                          onClick={() => void openReceipt(e.receiptPath!)}
                          className="mt-1 h-10 rounded-lg border-2 border-slate-300 px-3 text-sm font-semibold active:bg-slate-100"
                        >
                          Receipt
                        </button>
                      )}
                    </span>
                  </Tag>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={picking} title="Add to team money" onClose={() => setPicking(false)}>
        <EntryTypePicker
          onPick={(t) => {
            setPicking(false);
            setEditing({ entry: newEntry(t, data.season.id, today), isNew: true });
          }}
        />
      </Sheet>
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
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
