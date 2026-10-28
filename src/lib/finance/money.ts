import type { Frequency } from "./types";

/** "$1,127.95" style; negative amounts get a minus sign. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse what someone typed ("1,127.95", "$100", "40.5") into cents; null if it isn't money. */
export function parseCents(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean) && !/^\.\d{1,2}$/.test(clean)) return null;
  const [whole = "0", frac = ""] = clean.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

/**
 * Split cents into `n` parts that add up exactly. Parts differ by at most a penny; the
 * extra pennies go to the last parts, so everyone's schedule follows the same pattern.
 */
export function splitCents(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0));
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Due dates for `count` installments starting on `first`. Monthly dates keep the first
 * date's day, moved back at the end of short months (Jan 31 → Feb 28 → Mar 31).
 */
export function installmentDates(first: string, count: number, every: Frequency): string[] {
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    if (every === "month") {
      const lastDay = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
      return iso(new Date(Date.UTC(y, m - 1 + i, Math.min(d, lastDay))));
    }
    const days = (every === "week" ? 7 : 14) * i;
    return iso(new Date(Date.UTC(y, m - 1, d + days)));
  });
}

/** Today's date (YYYY-MM-DD) in the user's own time zone. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Jan 15" (or "Jan 15, 2028" when it isn't this year). */
export function shortDate(date: string, thisYear?: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[m - 1]} ${d}${thisYear !== undefined && y !== thisYear ? `, ${y}` : ""}`;
}
