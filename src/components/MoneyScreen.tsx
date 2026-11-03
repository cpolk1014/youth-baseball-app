"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { permissionsFor } from "@/lib/data/permissions";
import { myUserId, useAppData } from "@/lib/data/store";
import { moneyTimeline } from "@/lib/charts";
import { summaryToShow } from "@/lib/finance/entry";
import { playerLedger } from "@/lib/finance/ledger";
import { formatCents, shortDate } from "@/lib/finance/money";
import { ENTRY_LABEL, ENTRY_TYPES, type EntryType, type FinanceEntry } from "@/lib/finance/types";
import { AppShell, Loading } from "./AppShell";
import { MoneyChart } from "./charts/Charts";
import { kidsOf } from "./KidPicker";
import { EntryTypePicker, MoneyEntryForm, newEntry } from "./MoneyEntryForm";
import { FamilyCard, MoneySummaryCard, moneyPlayers } from "./MoneyParts";
import { ReceiptPreview } from "./ReceiptPreview";
import { DataTable, stopRow, type Column } from "./shell/DataTable";
import { Sheet } from "./Sheet";
import { useToday } from "./useToday";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

export function MoneyScreen() {
  const data = useAppData();
  const today = useToday();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ entry: FinanceEntry; isNew: boolean } | null>(null);
  const [filter, setFilter] = useState<EntryType | "all">("all");
  const [viewing, setViewing] = useState<FinanceEntry | null>(null);
  const router = useRouter();

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
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
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
              <Link href="/members" className="font-semibold text-[var(--team)] underline">
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
        {perms.seeAllMoney && moneyTimeline(data.financeEntries).length > 0 && (
          <div className="mt-3">
            <MoneyChart points={moneyTimeline(data.financeEntries)} year={year} />
          </div>
        )}
      </section>

      {perms.seeAllMoney && (
        <section className="mb-5">
          <h2 className={heading}>Families</h2>
          {families.length === 0 ? (
            <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
              Add players on the Roster tab first.
            </p>
          ) : (
            <>
              <div className="hidden lg:block">
                <DataTable
                  rows={families}
                  rowKey={(f) => f.player.id}
                  onRowClick={(f) => router.push(`/money/${f.player.id}`)}
                  rowLabel={(f) => `${f.player.name}: charges and payments`}
                  initialSort={{ key: "balance", dir: "desc" }}
                  columns={familyColumns(year)}
                />
              </div>
              <ul className="grid gap-2 md:grid-cols-2 lg:hidden">
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
            </>
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
                    ? "border-[var(--team)] bg-[var(--team)] text-white"
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
          <>
            {perms.seeAllMoney && (
              <div className="hidden lg:block">
                <DataTable
                  rows={shown}
                  rowKey={(e) => e.id}
                  onRowClick={
                    perms.editMoney ? (e) => setEditing({ entry: e, isNew: false }) : undefined
                  }
                  rowLabel={(e) => `Edit ${e.title}`}
                  initialSort={{ key: "date", dir: "desc" }}
                  columns={entryColumns(year, tagged, (e) => setViewing(e))}
                />
              </div>
            )}
            <ul className={`grid gap-2 md:grid-cols-2 ${perms.seeAllMoney ? "lg:hidden" : ""}`}>
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
                        <span className="block text-lg font-bold">
                          {formatCents(e.amountCents)}
                        </span>
                        {!perms.editMoney && e.receiptPath && (
                          <button
                            onClick={() => setViewing(e)}
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
          </>
        )}
      </section>

      <Sheet
        open={viewing !== null}
        title={viewing ? `Receipt: ${viewing.title}` : "Receipt"}
        onClose={() => setViewing(null)}
      >
        {viewing?.receiptPath && <ReceiptPreview path={viewing.receiptPath} />}
      </Sheet>
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

type Family = { player: { id: string; name: string }; ledger: ReturnType<typeof playerLedger> };

/** Treasurers on wide screens: every family's account in one table. */
function familyColumns(year: number): Column<Family>[] {
  const money = (cents: number, cls = "") => (
    <span className={`tabular-nums ${cls}`}>{cents ? formatCents(cents) : "—"}</span>
  );
  return [
    {
      key: "player",
      label: "Player",
      sort: (a, b) => a.player.name.localeCompare(b.player.name),
      render: (f) => <span className="font-semibold">{f.player.name}</span>,
    },
    {
      key: "charged",
      label: "Charged",
      align: "right",
      firstDir: "desc",
      sort: (a, b) => a.ledger.chargedCents - b.ledger.chargedCents,
      render: (f) => money(f.ledger.chargedCents),
    },
    {
      key: "credits",
      label: "Credits",
      align: "right",
      firstDir: "desc",
      sort: (a, b) => a.ledger.creditCents - b.ledger.creditCents,
      render: (f) => money(f.ledger.creditCents),
    },
    {
      key: "paid",
      label: "Paid",
      align: "right",
      firstDir: "desc",
      sort: (a, b) => a.ledger.paidCents - b.ledger.paidCents,
      render: (f) => money(f.ledger.paidCents),
    },
    {
      key: "balance",
      label: "Owes",
      align: "right",
      firstDir: "desc",
      sort: (a, b) =>
        a.ledger.overdueCents - b.ledger.overdueCents ||
        a.ledger.balanceCents - b.ledger.balanceCents,
      render: (f) =>
        f.ledger.balanceCents < 0 ? (
          <span className="font-semibold text-green-800 tabular-nums">
            {formatCents(-f.ledger.balanceCents)} credit
          </span>
        ) : f.ledger.balanceCents === 0 ? (
          <span className="font-semibold text-green-800">Paid</span>
        ) : (
          money(f.ledger.balanceCents, "font-bold")
        ),
    },
    {
      key: "overdue",
      label: "Overdue",
      align: "right",
      firstDir: "desc",
      sort: (a, b) => a.ledger.overdueCents - b.ledger.overdueCents,
      render: (f) =>
        money(f.ledger.overdueCents, f.ledger.overdueCents ? "font-bold text-red-700" : ""),
    },
    {
      key: "next",
      label: "Next due",
      sort: (a, b) =>
        (a.ledger.nextDue?.dueDate ?? "9999").localeCompare(b.ledger.nextDue?.dueDate ?? "9999"),
      render: (f) =>
        f.ledger.nextDue ? (
          `${formatCents(f.ledger.nextDue.amountCents - f.ledger.nextDue.paidCents)} · ${shortDate(f.ledger.nextDue.dueDate, year)}`
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ];
}

/** Treasurers on wide screens: every entry, newest first, sortable. */
function entryColumns(
  year: number,
  tagged: (e: FinanceEntry) => string,
  onReceipt: (e: FinanceEntry) => void,
): Column<FinanceEntry>[] {
  return [
    {
      key: "date",
      label: "Date",
      sort: (a, b) => a.date.localeCompare(b.date),
      firstDir: "desc",
      render: (e) => <span className="whitespace-nowrap">{shortDate(e.date, year)}</span>,
      className: "w-28",
    },
    {
      key: "type",
      label: "Type",
      sort: (a, b) => ENTRY_LABEL[a.type].localeCompare(ENTRY_LABEL[b.type]),
      render: (e) => (
        <span className="text-sm font-semibold whitespace-nowrap text-slate-600">
          {ENTRY_LABEL[e.type]}
          {e.estimate && " · est."}
          {e.refund && " · back"}
        </span>
      ),
    },
    {
      key: "title",
      label: "What",
      sort: (a, b) => a.title.localeCompare(b.title),
      render: (e) => <span className="font-semibold">{e.title}</span>,
    },
    {
      key: "who",
      label: "Who",
      render: (e) => tagged(e) || <span className="text-slate-400">—</span>,
    },
    {
      key: "payments",
      label: "Payments",
      align: "center",
      render: (e) => (e.dueDates.length > 1 ? e.dueDates.length : "1"),
    },
    {
      key: "receipt",
      label: "Receipt",
      align: "center",
      render: (e) =>
        e.receiptPath ? (
          <button
            onClick={(ev) => {
              stopRow(ev);
              onReceipt(e);
            }}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm font-semibold hover:border-slate-400"
          >
            View
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      firstDir: "desc",
      sort: (a, b) => a.amountCents - b.amountCents,
      render: (e) => <span className="font-bold tabular-nums">{formatCents(e.amountCents)}</span>,
    },
  ];
}
