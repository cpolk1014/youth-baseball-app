// The printable practice schedule (pure): which practices, grouped by month.
import type { Practice } from "@/lib/data/types";

export type PrintRange = "upcoming" | "season";

export interface PrintMonth {
  /** "November 2026" */
  label: string;
  practices: Practice[];
}

/** Upcoming (today on) or the whole season, in date order, grouped by month. */
export function practiceMonths(
  practices: Practice[],
  range: PrintRange,
  today: string,
): PrintMonth[] {
  const shown = practices
    .filter((p) => range === "season" || p.date >= today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );
  const months: PrintMonth[] = [];
  for (const p of shown) {
    const label = new Date(`${p.date.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const last = months.at(-1);
    if (last?.label === label) last.practices.push(p);
    else months.push({ label, practices: [p] });
  }
  return months;
}
