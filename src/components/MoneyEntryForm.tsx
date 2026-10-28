"use client";

import { useState } from "react";
import { deleteFinanceEntry, newId, saveFinanceEntry, useAppData } from "@/lib/data/store";
import { eachLabel, sharesFor } from "@/lib/finance/entry";
import { formatCents, installmentDates, parseCents, splitCents } from "@/lib/finance/money";
import {
  CATEGORIES,
  ENTRY_HINT,
  ENTRY_LABEL,
  ENTRY_TYPES,
  METHODS,
  isCharge,
  isSinglePlayer,
  type EntryType,
  type FinanceEntry,
  type Frequency,
} from "@/lib/finance/types";
import { activePlayers } from "@/lib/lineup/edit";
import { Toggle } from "./PlayerForm";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[#0b1f3a] focus:outline-none";
const label = "flex min-w-0 flex-col gap-1";
const labelText = "text-base font-semibold";

const DEFAULT_TITLE: Partial<Record<EntryType, string>> = {
  safe_at_home: "Payment",
  rain_check: "Credit",
};
const PLACEHOLDER: Record<EntryType, string> = {
  bat_around: "Pigeon Forge World Series",
  cleanup: "Extra uniform",
  walkoff: "Umpires, tournament deposit…",
  safe_at_home: "Payment",
  rain_check: "Refund of estimate",
  grand_slam: "LAFF fundraiser",
};
const PAYMENT_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

/** Big chips to pick what kind of entry to add. */
export function EntryTypePicker({ onPick }: { onPick: (t: EntryType) => void }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {ENTRY_TYPES.map((t) => (
        <li key={t}>
          <button
            onClick={() => onPick(t)}
            className="flex h-full min-h-16 w-full flex-col items-start justify-center rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-left active:bg-slate-50"
          >
            <span className="text-lg font-bold text-[#0b1f3a]">{ENTRY_LABEL[t]}</span>
            <span className="text-sm text-slate-600">{ENTRY_HINT[t]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function newEntry(type: EntryType, seasonId: string, today: string): FinanceEntry {
  return {
    id: newId(),
    seasonId,
    type,
    title: DEFAULT_TITLE[type] ?? "",
    amountCents: 0,
    date: today,
    category: type === "grand_slam" ? "Fundraiser" : null,
    payee: null,
    method: type === "safe_at_home" ? "Venmo" : null,
    refund: false,
    estimate: false,
    dueDates: [],
    note: null,
  };
}

/** Add or edit one money entry. Waits for the save and shows an error if it fails. */
export function MoneyEntryForm({
  entry,
  isNew,
  presetPlayerId,
  onDone,
}: {
  entry: FinanceEntry;
  isNew: boolean;
  presetPlayerId?: string;
  onDone: () => void;
}) {
  const data = useAppData()!;
  const roster = activePlayers(data.players);
  const existingShares = data.financeShares.filter((s) => s.entryId === entry.id);
  // A Bat Around stays split across the players it was charged to; new ones use the roster.
  const splitPlayers =
    !isNew && entry.type === "bat_around"
      ? existingShares.map((s) => s.playerId)
      : roster.map((p) => p.id);

  const [title, setTitle] = useState(entry.title);
  const [amount, setAmount] = useState(
    entry.amountCents ? (entry.amountCents / 100).toFixed(2) : "",
  );
  const [date, setDate] = useState(entry.date);
  const [playerId, setPlayerId] = useState(existingShares[0]?.playerId ?? presetPlayerId ?? "");
  const [category, setCategory] = useState(entry.category ?? "");
  const [payee, setPayee] = useState(entry.payee ?? "");
  const [method, setMethod] = useState(entry.method ?? "");
  const [refund, setRefund] = useState(entry.refund);
  const [estimate, setEstimate] = useState(entry.estimate);
  const [note, setNote] = useState(entry.note ?? "");
  const [payments, setPayments] = useState(Math.max(1, entry.dueDates.length));
  const [firstDue, setFirstDue] = useState(entry.dueDates[0] ?? entry.date);
  const [every, setEvery] = useState<Frequency>("month");
  // Dates the treasurer moved by hand, by installment number.
  const [moved, setMoved] = useState<Record<number, string>>(() =>
    Object.fromEntries(entry.dueDates.map((d, i) => [i, d])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const type = entry.type;
  const cents = parseCents(amount);
  const charge = isCharge(type);
  const generated = installmentDates(firstDue || date, payments, every);
  const dueDates = payments > 1 ? generated.map((d, i) => moved[i] ?? d) : [];
  const players = type === "bat_around" ? splitPlayers : playerId ? [playerId] : [];
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? "Player";

  const problem = !title.trim()
    ? "Add a title."
    : cents === null || cents <= 0
      ? "Enter an amount, like 125.00."
      : isSinglePlayer(type) && !playerId
        ? "Pick a player."
        : type === "bat_around" && players.length === 0
          ? "Add players to the roster first."
          : null;

  const save = async () => {
    if (problem || cents === null) return;
    const saved: FinanceEntry = {
      ...entry,
      title: title.trim(),
      amountCents: cents,
      date,
      category: category || null,
      payee: type === "walkoff" ? payee.trim() || null : null,
      method: type === "walkoff" || type === "safe_at_home" ? method || null : null,
      refund: type === "safe_at_home" && refund,
      estimate: (type === "walkoff" || type === "grand_slam") && estimate,
      dueDates: charge ? dueDates : [],
      note: note.trim() || null,
    };
    setSaving(true);
    setError(null);
    try {
      await saveFinanceEntry(saved, sharesFor(saved, players, newId));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  // Per-family amounts for the schedule preview.
  const perPlayer = type === "bat_around" ? splitCents(cents ?? 0, players.length) : [cents ?? 0];
  const lowShare = perPlayer[0] ?? 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4"
    >
      <p className="-mt-1 text-base text-slate-600">{ENTRY_HINT[type]}</p>

      {isSinglePlayer(type) && (
        <label className={label}>
          <span className={labelText}>Player</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={field}>
            <option value="">Pick a player</option>
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={label}>
        <span className={labelText}>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={PLACEHOLDER[type]}
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span className={labelText}>{type === "bat_around" ? "Team total" : "Amount"}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={field}
          />
        </label>
        <label className={label}>
          <span className={labelText}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {type === "bat_around" && cents !== null && cents > 0 && players.length > 0 && (
        <p className="rounded-xl bg-slate-100 p-3 text-base">
          Split {players.length} ways:{" "}
          <strong>{eachLabel(cents, players.length, formatCents)}</strong>
        </p>
      )}

      {charge && (
        <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 p-3">
          <legend className="px-1 text-base font-semibold">Payments</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              <span className="text-sm font-semibold text-slate-600">How many</span>
              <select
                value={payments}
                onChange={(e) => {
                  setPayments(Number(e.target.value));
                  setMoved({});
                }}
                className={field}
              >
                {PAYMENT_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1 (all at once)" : n}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className="text-sm font-semibold text-slate-600">
                {payments > 1 ? "First due" : "Due"}
              </span>
              <input
                type="date"
                value={firstDue}
                onChange={(e) => {
                  setFirstDue(e.target.value);
                  setMoved({});
                }}
                className={field}
              />
            </label>
          </div>
          {payments > 1 && (
            <>
              <label className={label}>
                <span className="text-sm font-semibold text-slate-600">Every</span>
                <select
                  value={every}
                  onChange={(e) => {
                    setEvery(e.target.value as Frequency);
                    setMoved({});
                  }}
                  className={field}
                >
                  <option value="month">Month</option>
                  <option value="2weeks">2 weeks</option>
                  <option value="week">Week</option>
                </select>
              </label>
              <div>
                <p className="mb-1 text-sm font-semibold text-slate-600">
                  Schedule (tap a date to move it)
                </p>
                <ul className="flex flex-col gap-1">
                  {dueDates.map((d, i) => {
                    const each = splitCents(lowShare, payments)[i] ?? 0;
                    const team =
                      type === "bat_around"
                        ? perPlayer.reduce(
                            (s, share) => s + (splitCents(share, payments)[i] ?? 0),
                            0,
                          )
                        : null;
                    return (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-6 text-base font-bold text-slate-500">{i + 1}</span>
                        <input
                          type="date"
                          value={d}
                          aria-label={`Payment ${i + 1} due date`}
                          onChange={(e) => setMoved({ ...moved, [i]: e.target.value })}
                          className="h-11 min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-2 text-base"
                        />
                        <span className="w-24 shrink-0 text-right text-base font-semibold">
                          {formatCents(each)}
                          {team !== null && (
                            <span className="block text-xs font-normal text-slate-600">
                              team {formatCents(team)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </fieldset>
      )}

      {type === "walkoff" && (
        <label className={label}>
          <span className={labelText}>Paid to</span>
          <input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            maxLength={80}
            placeholder="Umpire crew, tournament, a coach…"
            className={field}
          />
        </label>
      )}

      {(type === "walkoff" || type === "safe_at_home") && (
        <label className={label}>
          <span className={labelText}>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            <option value="">Not set</option>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      {type !== "safe_at_home" && type !== "rain_check" && (
        <label className={label}>
          <span className={labelText}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            <option value="">None</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      {type === "safe_at_home" && (
        <Toggle
          label="Money back to the family"
          hint="A refund of an overpayment, not a payment."
          checked={refund}
          onChange={setRefund}
        />
      )}
      {(type === "walkoff" || type === "grand_slam") && (
        <Toggle
          label="Estimate"
          hint={
            type === "walkoff"
              ? "Planned, not paid yet. Left out of totals."
              : "Expected, not received yet. Left out of totals."
          }
          checked={estimate}
          onChange={setEstimate}
        />
      )}

      <label className={label}>
        <span className={labelText}>Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className={field}
        />
      </label>

      {!isNew && type === "bat_around" && (
        <p className="text-sm text-slate-600">
          Split across the {players.length} players it was charged to:{" "}
          {players.map(nameOf).join(", ")}.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-white px-4 pt-2 pb-1 md:-mx-6 md:px-6">
        {problem && amount !== "" && <p className="text-sm text-slate-600">{problem}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDone}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!problem || saving}
            className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {!isNew &&
          (confirmDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await deleteFinanceEntry(entry.id);
                  onDone();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't delete.");
                  setSaving(false);
                }
              }}
              className="h-12 rounded-xl bg-red-700 text-base font-bold text-white"
            >
              Tap again to delete {ENTRY_LABEL[type]}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-12 text-base font-semibold text-red-700 underline"
            >
              Delete
            </button>
          ))}
      </div>
    </form>
  );
}
