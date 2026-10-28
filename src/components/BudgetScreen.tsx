"use client";

import { useState } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { useAppData } from "@/lib/data/store";
import { budgetReport, type BudgetRow } from "@/lib/finance/budget";
import { formatCents, shortDate } from "@/lib/finance/money";
import { ENTRY_LABEL, type FinanceEntry } from "@/lib/finance/types";
import { AppShell, Loading } from "./AppShell";
import { MoneyEntryForm, newEntry } from "./MoneyEntryForm";
import { Sheet } from "./Sheet";
import { useToday } from "./useToday";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

/** Planned vs. actual, by category, for spending (Walkoffs) and fundraising (Grand Slams). */
export function BudgetScreen() {
  const data = useAppData();
  const today = useToday();
  const [editing, setEditing] = useState<{ entry: FinanceEntry; isNew: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (!data) {
    return (
      <AppShell title="Budget" backHref="/money" tab="money">
        <Loading />
      </AppShell>
    );
  }
  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  if (!perms.seeAllMoney) {
    return (
      <AppShell title="Budget" backHref="/money" tab="money">
        <p className="text-lg">The budget is for coaches and the treasurer.</p>
      </AppShell>
    );
  }

  const year = Number(today.slice(0, 4)) || undefined;
  const r = budgetReport(data.financeEntries);
  const addLine = (type: "walkoff" | "grand_slam") => {
    const e = newEntry(type, data.season.id, today);
    setEditing({
      entry: { ...e, estimate: true, title: type === "walkoff" ? "Season budget" : "" },
      isNew: true,
    });
  };
  const edit = perms.editMoney
    ? (entry: FinanceEntry) => setEditing({ entry, isNew: false })
    : undefined;
  const short = r.projectedLeftCents < 0;

  return (
    <AppShell
      title="Budget"
      subtitle={`${data.team.name} · ${data.season.name}`}
      backHref="/money"
      tab="money"
    >
      <section
        className={`mb-5 rounded-xl border-2 p-4 ${short ? "border-red-700 bg-red-50" : "border-slate-200 bg-white"}`}
      >
        <h2 className={heading}>Season outlook</h2>
        <p className="flex justify-between gap-3 py-1 text-base">
          <span>Expected spending</span>
          <span className="font-semibold">{formatCents(r.projectedSpendCents)}</span>
        </p>
        <p className="flex justify-between gap-3 py-1 text-base">
          <span>Charged to families + fundraising</span>
          <span className="font-semibold">{formatCents(r.projectedFundsCents)}</span>
        </p>
        <p className="mt-1 flex justify-between gap-3 border-t-2 border-slate-200 pt-2 text-lg font-bold">
          <span>{short ? "Short by" : "Left over"}</span>
          <span className={short ? "text-red-700" : "text-green-800"}>
            {formatCents(Math.abs(r.projectedLeftCents))}
          </span>
        </p>
        {short && (
          <p className="mt-1 text-base text-red-900">
            Families may need another Bat Around, or the budget needs trimming.
          </p>
        )}
        <p className="mt-2 text-sm text-slate-600">
          Each category counts at its budget, or what&apos;s been spent if that&apos;s more.
        </p>
      </section>

      <BudgetSection
        title="Spending (Walkoffs)"
        rows={r.spending}
        verbs={["spent", "over", "left"]}
        open={open}
        setOpen={setOpen}
        onEdit={edit}
        year={year}
        empty="No spending budget yet. Add one line per category for the season, like Umpires (PAP) or Tournaments."
      />
      {perms.editMoney && (
        <button
          onClick={() => addLine("walkoff")}
          className="-mt-3 mb-6 h-12 w-full rounded-xl border-2 border-dashed border-slate-400 text-base font-bold text-slate-700 active:bg-slate-100"
        >
          + Add spending budget
        </button>
      )}

      <BudgetSection
        title="Fundraising (Grand Slams)"
        rows={r.income}
        verbs={["raised", "above goal", "to go"]}
        open={open}
        setOpen={setOpen}
        onEdit={edit}
        year={year}
        empty="No fundraising goals yet."
      />
      {perms.editMoney && (
        <button
          onClick={() => addLine("grand_slam")}
          className="-mt-3 mb-6 h-12 w-full rounded-xl border-2 border-dashed border-slate-400 text-base font-bold text-slate-700 active:bg-slate-100"
        >
          + Add fundraising goal
        </button>
      )}

      <Sheet
        open={editing !== null}
        title={
          editing
            ? `${editing.isNew ? "Add" : "Edit"} ${editing.entry.estimate ? "budget line" : ENTRY_LABEL[editing.entry.type]}`
            : ""
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

function BudgetSection({
  title,
  rows,
  verbs,
  open,
  setOpen,
  onEdit,
  year,
  empty,
}: {
  title: string;
  rows: BudgetRow[];
  /** What happened, past the plan, and still to come: ["spent", "over", "left"]. */
  verbs: [string, string, string];
  open: string | null;
  setOpen: (key: string | null) => void;
  onEdit?: (e: FinanceEntry) => void;
  year?: number;
  empty: string;
}) {
  return (
    <section className="mb-6">
      <h2 className={heading}>{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
          {empty}
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 md:items-start">
          {rows.map((row) => {
            const key = `${title}:${row.category}`;
            const isOpen = open === key;
            const over = row.leftCents < 0;
            const pct =
              row.plannedCents > 0
                ? Math.min(100, Math.round((row.actualCents / row.plannedCents) * 100))
                : 100;
            return (
              <li key={key} className="rounded-xl border-2 border-slate-200 bg-white">
                <button
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="w-full p-3 text-left"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{row.category}</span>
                    <span
                      className={`text-base font-bold ${over && verbs[0] === "spent" ? "text-red-700" : over ? "text-green-800" : ""}`}
                    >
                      {row.plannedCents === 0
                        ? "No budget"
                        : over
                          ? `${formatCents(-row.leftCents)} ${verbs[1]}`
                          : `${formatCents(row.leftCents)} ${verbs[2]}`}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {formatCents(row.actualCents)} {verbs[0]}
                    {row.plannedCents > 0 && ` of ${formatCents(row.plannedCents)}`}
                  </span>
                  <span
                    className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-200"
                    aria-hidden="true"
                  >
                    <span
                      className={`block h-full ${over && verbs[0] === "spent" ? "bg-red-700" : "bg-green-700"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t-2 border-slate-100 px-3 pt-2 pb-3">
                    <EntryList label="Budget" entries={row.plan} onEdit={onEdit} year={year} />
                    <EntryList label="Actual" entries={row.actual} onEdit={onEdit} year={year} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EntryList({
  label,
  entries,
  onEdit,
  year,
}: {
  label: string;
  entries: FinanceEntry[];
  onEdit?: (e: FinanceEntry) => void;
  year?: number;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-1">
      <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</p>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <button
              disabled={!onEdit}
              onClick={() => onEdit?.(e)}
              className="flex min-h-11 w-full items-center gap-2 text-left text-base"
            >
              <span className="min-w-0 flex-1 truncate">
                {e.title}
                <span className="text-sm text-slate-600"> · {shortDate(e.date, year)}</span>
              </span>
              <span className="shrink-0 font-semibold">{formatCents(e.amountCents)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
