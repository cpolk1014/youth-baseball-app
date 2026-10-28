import { splitCents } from "./money";
import { isCharge, type FinanceEntry, type FinanceShare } from "./types";

export type InstallmentStatus = "paid" | "partial" | "due" | "overdue";

export interface Installment {
  entryId: string;
  title: string;
  /** 1-based, and how many in the plan. */
  number: number;
  of: number;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  status: InstallmentStatus;
}

export interface PlayerLedger {
  installments: Installment[];
  /** Charges (Bat Arounds + Cleanups) for this player. */
  chargedCents: number;
  /** Rain Check credits. */
  creditCents: number;
  /** Safe at Home payments minus money given back. */
  paidCents: number;
  /** What they still owe; negative means the team owes them. */
  balanceCents: number;
  overdueCents: number;
  nextDue: Installment | null;
}

/** Each charge's dates: its installments, or one payment on the entry date. */
export const dueDatesOf = (e: FinanceEntry) => (e.dueDates.length ? e.dueDates : [e.date]);

/**
 * One player's account. Payments and credits go toward the oldest installment first, so a
 * family that pays it all up front shows every installment paid.
 */
export function playerLedger(
  playerId: string,
  entries: readonly FinanceEntry[],
  shares: readonly FinanceShare[],
  today: string,
): PlayerLedger {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const mine = shares.filter((s) => s.playerId === playerId);
  let chargedCents = 0;
  let creditCents = 0;
  let paidCents = 0;
  const raw: Omit<Installment, "paidCents" | "status">[] = [];
  for (const s of mine) {
    const e = byId.get(s.entryId);
    if (!e) continue;
    if (isCharge(e.type)) {
      chargedCents += s.amountCents;
      const dates = dueDatesOf(e);
      splitCents(s.amountCents, dates.length).forEach((amountCents, i) =>
        raw.push({
          entryId: e.id,
          title: e.title,
          number: i + 1,
          of: dates.length,
          dueDate: dates[i]!,
          amountCents,
        }),
      );
    } else if (e.type === "rain_check") creditCents += s.amountCents;
    else if (e.type === "safe_at_home") paidCents += e.refund ? -s.amountCents : s.amountCents;
  }

  raw.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number);
  let available = Math.max(0, paidCents + creditCents);
  const installments = raw.map((r): Installment => {
    const applied = Math.min(available, r.amountCents);
    available -= applied;
    const status: InstallmentStatus =
      applied >= r.amountCents
        ? "paid"
        : r.dueDate < today
          ? "overdue"
          : applied > 0
            ? "partial"
            : "due";
    return { ...r, paidCents: applied, status };
  });

  return {
    installments,
    chargedCents,
    creditCents,
    paidCents,
    balanceCents: chargedCents - creditCents - paidCents,
    overdueCents: installments
      .filter((i) => i.status === "overdue")
      .reduce((sum, i) => sum + i.amountCents - i.paidCents, 0),
    nextDue: installments.find((i) => i.status !== "paid") ?? null,
  };
}

/** The money summary everyone on the team sees (totals only, no family details). */
export interface MoneySummary {
  batAroundCents: number;
  cleanupCents: number;
  grandSlamCents: number;
  totalInCents: number;
  rainCheckCents: number;
  walkoffCents: number;
  totalOutCents: number;
  /** What's left once every family has paid. */
  leftOverCents: number;
  /** What families owe in total (charges minus credits) and what they've paid. */
  billedCents: number;
  collectedCents: number;
  cashOnHandCents: number;
  /** Estimates, kept out of the totals above. */
  plannedOutCents: number;
  expectedInCents: number;
}

export function moneySummary(entries: readonly FinanceEntry[]): MoneySummary {
  const sum = (pred: (e: FinanceEntry) => boolean) =>
    entries.filter(pred).reduce((s, e) => s + e.amountCents, 0);
  const batAroundCents = sum((e) => e.type === "bat_around");
  const cleanupCents = sum((e) => e.type === "cleanup");
  const grandSlamCents = sum((e) => e.type === "grand_slam" && !e.estimate);
  const rainCheckCents = sum((e) => e.type === "rain_check");
  const walkoffCents = sum((e) => e.type === "walkoff" && !e.estimate);
  const collectedCents =
    sum((e) => e.type === "safe_at_home" && !e.refund) -
    sum((e) => e.type === "safe_at_home" && e.refund);
  const totalInCents = batAroundCents + cleanupCents + grandSlamCents;
  const totalOutCents = rainCheckCents + walkoffCents;
  return {
    batAroundCents,
    cleanupCents,
    grandSlamCents,
    totalInCents,
    rainCheckCents,
    walkoffCents,
    totalOutCents,
    leftOverCents: totalInCents - totalOutCents,
    billedCents: batAroundCents + cleanupCents - rainCheckCents,
    collectedCents,
    cashOnHandCents: collectedCents + grandSlamCents - walkoffCents,
    plannedOutCents: sum((e) => e.type === "walkoff" && e.estimate),
    expectedInCents: sum((e) => e.type === "grand_slam" && e.estimate),
  };
}
