import { CATEGORIES, type EntryType, type FinanceEntry } from "./types";

// Budget: estimate entries are the plan ("Umpires (PAP): $2,200 for the season"); real
// entries in the same category are what actually happened. Estimates stay as the plan and
// get edited as the season goes; nothing has to be linked by hand.

export interface BudgetRow {
  /** Category name; "Uncategorized" when none was picked. */
  category: string;
  plannedCents: number;
  actualCents: number;
  /** Planned minus actual: what's left (positive) or how far over (negative). */
  leftCents: number;
  /** The estimate entries (the plan) and the real ones, newest first. */
  plan: FinanceEntry[];
  actual: FinanceEntry[];
}

export interface BudgetReport {
  spending: BudgetRow[];
  income: BudgetRow[];
  /** Spending we expect for the season: each category's plan, or its actual if over. */
  projectedSpendCents: number;
  /** Money the team expects to have: what families were charged (less credits), Grand
   * Slams received, and Grand Slams still expected. */
  projectedFundsCents: number;
  /** Funds minus spending: negative means families may need another charge. */
  projectedLeftCents: number;
}

const UNCATEGORIZED = "Uncategorized";
const categoryOf = (e: FinanceEntry) => e.category || UNCATEGORIZED;
const sum = (es: readonly FinanceEntry[]) => es.reduce((s, e) => s + e.amountCents, 0);
const newest = (a: FinanceEntry, b: FinanceEntry) => b.date.localeCompare(a.date);

function rows(entries: readonly FinanceEntry[], type: EntryType): BudgetRow[] {
  const ofType = entries.filter((e) => e.type === type);
  const names = [...new Set(ofType.map(categoryOf))];
  const order = (c: string) => {
    const i = (CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? CATEGORIES.length : i;
  };
  names.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return names.map((category) => {
    const inCat = ofType.filter((e) => categoryOf(e) === category);
    const plan = inCat.filter((e) => e.estimate).sort(newest);
    const actual = inCat.filter((e) => !e.estimate).sort(newest);
    const plannedCents = sum(plan);
    const actualCents = sum(actual);
    return {
      category,
      plannedCents,
      actualCents,
      leftCents: plannedCents - actualCents,
      plan,
      actual,
    };
  });
}

/** What's still to come in each row: the unspent (or unreceived) part of its plan. */
export const remainingCents = (rs: readonly BudgetRow[]) =>
  rs.reduce((s, r) => s + Math.max(0, r.leftCents), 0);

export function budgetReport(entries: readonly FinanceEntry[]): BudgetReport {
  const spending = rows(entries, "walkoff");
  const income = rows(entries, "grand_slam");
  const projectedSpendCents = spending.reduce(
    (s, r) => s + Math.max(r.plannedCents, r.actualCents),
    0,
  );
  const charged = sum(entries.filter((e) => e.type === "bat_around" || e.type === "cleanup"));
  const credits = sum(entries.filter((e) => e.type === "rain_check"));
  const received = income.reduce((s, r) => s + r.actualCents, 0);
  const projectedFundsCents = charged - credits + received + remainingCents(income);
  return {
    spending,
    income,
    projectedSpendCents,
    projectedFundsCents,
    projectedLeftCents: projectedFundsCents - projectedSpendCents,
  };
}
