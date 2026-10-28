import { describe, expect, it } from "vitest";
import { playerLedger, moneySummary } from "./ledger";
import type { EntryType, FinanceEntry, FinanceShare } from "./types";

const entry = (
  id: string,
  type: EntryType,
  amountCents: number,
  extra: Partial<FinanceEntry> = {},
): FinanceEntry => ({
  id,
  seasonId: "s",
  type,
  title: id,
  amountCents,
  date: "2027-01-01",
  category: null,
  payee: null,
  method: null,
  refund: false,
  estimate: false,
  dueDates: [],
  note: null,
  receiptPath: null,
  ...extra,
});
const share = (entryId: string, playerId: string, amountCents: number): FinanceShare => ({
  id: `${entryId}-${playerId}`,
  entryId,
  playerId,
  amountCents,
});

// Pigeon Forge: $1,100 across 11 players in 4 monthly payments.
const pf = entry("pf", "bat_around", 110000, {
  dueDates: ["2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15"],
});
const players = Array.from({ length: 11 }, (_, i) => `p${i}`);
const pfShares = players.map((p) => share("pf", p, 10000));

describe("player ledger", () => {
  it("shows a share as installments with status", () => {
    const l = playerLedger("p0", [pf], pfShares, "2027-02-20");
    expect(l.chargedCents).toBe(10000);
    expect(l.installments.map((i) => [i.dueDate, i.amountCents, i.status])).toEqual([
      ["2027-01-15", 2500, "overdue"],
      ["2027-02-15", 2500, "overdue"],
      ["2027-03-15", 2500, "due"],
      ["2027-04-15", 2500, "due"],
    ]);
    expect(l.overdueCents).toBe(5000);
    expect(l.nextDue?.dueDate).toBe("2027-01-15");
  });

  it("applies payments and credits to the oldest installment first", () => {
    const paid = entry("pay", "safe_at_home", 3000);
    const credit = entry("rc", "rain_check", 1000);
    const l = playerLedger(
      "p0",
      [pf, paid, credit],
      [...pfShares, share("pay", "p0", 3000), share("rc", "p0", 1000)],
      "2027-02-20",
    );
    expect(l.installments.map((i) => [i.paidCents, i.status])).toEqual([
      [2500, "paid"],
      [1500, "overdue"],
      [0, "due"],
      [0, "due"],
    ]);
    expect(l.balanceCents).toBe(6000);
    expect(l.nextDue?.number).toBe(2);
  });

  it("marks everything paid for a family that pays up front, and tracks money back", () => {
    const upFront = entry("pay", "safe_at_home", 12000);
    const back = entry("back", "safe_at_home", 2000, { refund: true });
    const before = playerLedger(
      "p1",
      [pf, upFront],
      [...pfShares, share("pay", "p1", 12000)],
      "2027-01-01",
    );
    expect(before.installments.every((i) => i.status === "paid")).toBe(true);
    expect(before.balanceCents).toBe(-2000);
    expect(before.nextDue).toBeNull();
    const after = playerLedger(
      "p1",
      [pf, upFront, back],
      [...pfShares, share("pay", "p1", 12000), share("back", "p1", 2000)],
      "2027-01-01",
    );
    expect(after.balanceCents).toBe(0);
    expect(after.paidCents).toBe(10000);
  });

  it("splits uneven shares into installments that add up", () => {
    const e = entry("x", "cleanup", 112795, {
      dueDates: ["2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15"],
    });
    const l = playerLedger("p0", [e], [share("x", "p0", 112795)], "2027-01-01");
    expect(l.installments.map((i) => i.amountCents)).toEqual([28198, 28199, 28199, 28199]);
  });

  it("ignores other players and walkoffs", () => {
    const w = entry("w", "walkoff", 50000);
    const l = playerLedger("nobody", [pf, w], pfShares, "2027-01-01");
    expect(l.installments).toEqual([]);
    expect(l.balanceCents).toBe(0);
  });
});

describe("team summary", () => {
  it("matches the agreed layout: money in, money out, left over, collected, cash", () => {
    const s = moneySummary([
      entry("ba", "bat_around", 150000),
      entry("cu", "cleanup", 20000),
      entry("gs", "grand_slam", 150000),
      entry("gs2", "grand_slam", 478250, { estimate: true }),
      entry("rc", "rain_check", 50000),
      entry("w1", "walkoff", 270000),
      entry("w2", "walkoff", 80000, { estimate: true }),
      entry("pay", "safe_at_home", 150000),
      entry("back", "safe_at_home", 10000, { refund: true }),
    ]);
    expect(s).toEqual({
      batAroundCents: 150000,
      cleanupCents: 20000,
      grandSlamCents: 150000,
      totalInCents: 320000,
      rainCheckCents: 50000,
      walkoffCents: 270000,
      totalOutCents: 320000,
      leftOverCents: 0,
      billedCents: 120000,
      collectedCents: 140000,
      cashOnHandCents: 20000,
      plannedOutCents: 80000,
      expectedInCents: 478250,
    });
  });
});
