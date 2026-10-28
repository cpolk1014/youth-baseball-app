// Team money: one list of entries; balances and totals are always computed from it.

export const ENTRY_TYPES = [
  "bat_around",
  "cleanup",
  "walkoff",
  "safe_at_home",
  "rain_check",
  "grand_slam",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_LABEL: Record<EntryType, string> = {
  bat_around: "Bat Around",
  cleanup: "Cleanup",
  walkoff: "Walkoff",
  safe_at_home: "Safe at Home",
  rain_check: "Rain Check",
  grand_slam: "Grand Slam",
};

/** Plain-English line under each name, so nobody has to decode the baseball term. */
export const ENTRY_HINT: Record<EntryType, string> = {
  bat_around: "Team cost split across every player",
  cleanup: "Charge to one player",
  walkoff: "Team pays out",
  safe_at_home: "A family pays",
  rain_check: "Credit to one family",
  grand_slam: "Money in: fundraiser or sponsor",
};

export const CATEGORIES = [
  "Tournament",
  "Umpires",
  "Coach travel",
  "Equipment & swag",
  "Fundraiser",
  "Other",
] as const;

export const METHODS = ["Cash", "Venmo", "Check", "Zelle", "Card", "Other"] as const;

export type Frequency = "month" | "2weeks" | "week";

export interface FinanceEntry {
  id: string;
  seasonId: string;
  type: EntryType;
  title: string;
  /** Whole cents; always positive. */
  amountCents: number;
  date: string; // YYYY-MM-DD
  category: string | null;
  /** Walkoff: who was paid. */
  payee: string | null;
  method: string | null;
  /** Safe at Home only: money given back to the family (a refund), not a payment. */
  refund: boolean;
  /** Walkoff or Grand Slam that hasn't happened yet; left out of totals. */
  estimate: boolean;
  /** Bat Around / Cleanup installments; empty means one payment due on `date`. */
  dueDates: string[];
  note: string | null;
  /** Walkoff only: storage path of a receipt photo or PDF. */
  receiptPath: string | null;
}

/** Who an entry is tagged to and their part of it. */
export interface FinanceShare {
  id: string;
  entryId: string;
  playerId: string;
  amountCents: number;
}

/** Charges are what families owe; the others are tagged to a player but reduce it. */
export const isCharge = (t: EntryType) => t === "bat_around" || t === "cleanup";
/** Types tagged to exactly one player. */
export const isSinglePlayer = (t: EntryType) =>
  t === "cleanup" || t === "safe_at_home" || t === "rain_check";
