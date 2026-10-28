import { describe, expect, it } from "vitest";
import { budgetReport } from "./budget";
import { moneySummary } from "./ledger";
import type { EntryType, FinanceEntry } from "./types";

let n = 0;
const entry = (
  type: EntryType,
  amountCents: number,
  extra: Partial<FinanceEntry> = {},
): FinanceEntry => ({
  id: `e${++n}`,
  seasonId: "s",
  type,
  title: "x",
  amountCents,
  date: `2027-01-${String((n % 28) + 1).padStart(2, "0")}`,
  category: null,
  payee: null,
  method: null,
  refund: false,
  estimate: false,
  dueDates: [],
  note: null,
  ...extra,
});

// PAP budgeted once for the season, then paid weekend by weekend.
const season = [
  entry("walkoff", 220000, { category: "Umpires", estimate: true }),
  entry("walkoff", 16500, { category: "Umpires" }),
  entry("walkoff", 18000, { category: "Umpires" }),
  entry("walkoff", 803200, { category: "Tournament", estimate: true }),
  entry("walkoff", 850000, { category: "Tournament" }),
  entry("walkoff", 20200, { category: "Other" }),
  entry("walkoff", 5000),
  entry("grand_slam", 478250, { category: "Fundraiser", estimate: true }),
  entry("grand_slam", 300000, { category: "Fundraiser" }),
  entry("bat_around", 1000000),
  entry("cleanup", 20000),
  entry("rain_check", 10000),
];

describe("budget", () => {
  it("compares plan and actual by category, in category order", () => {
    const r = budgetReport(season);
    expect(r.spending.map((x) => [x.category, x.plannedCents, x.actualCents, x.leftCents])).toEqual(
      [
        ["Tournament", 803200, 850000, -46800],
        ["Umpires", 220000, 34500, 185500],
        ["Other", 0, 20200, -20200],
        ["Uncategorized", 0, 5000, -5000],
      ],
    );
    expect(r.spending[1]?.plan).toHaveLength(1);
    expect(r.spending[1]?.actual).toHaveLength(2);
    expect(r.income.map((x) => [x.category, x.plannedCents, x.actualCents])).toEqual([
      ["Fundraiser", 478250, 300000],
    ]);
  });

  it("projects the season: spending vs. money coming in", () => {
    const r = budgetReport(season);
    // Tournament over plan counts at actual; Umpires at plan; unplanned at actual.
    expect(r.projectedSpendCents).toBe(850000 + 220000 + 20200 + 5000);
    // Charged 1,020,000 − credits 10,000 + received 300,000 + still expected 178,250.
    expect(r.projectedFundsCents).toBe(1020000 - 10000 + 300000 + 178250);
    expect(r.projectedLeftCents).toBe(1488250 - 1095200);
  });

  it("team totals count only the budget not yet spent or received", () => {
    const s = moneySummary(season);
    expect(s.plannedOutCents).toBe(185500);
    expect(s.expectedInCents).toBe(178250);
    expect(s.walkoffCents).toBe(16500 + 18000 + 850000 + 20200 + 5000);
  });

  it("handles an empty season", () => {
    expect(budgetReport([])).toEqual({
      spending: [],
      income: [],
      projectedSpendCents: 0,
      projectedFundsCents: 0,
      projectedLeftCents: 0,
    });
  });
});
