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

/** "6:10" from "18:00" and 10 minutes after it (12-hour, no AM/PM). */
function clock(start: string, plus: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = (h! * 60 + m! + plus) % (24 * 60);
  const hour = Math.floor(total / 60);
  const min = total % 60;
  return `${((hour + 11) % 12) + 1}:${String(min).padStart(2, "0")}`;
}

/**
 * When each drill runs, from the practice's start time ("6:00–6:10"), in order. Null without
 * a start time.
 */
export function drillTimes(
  startTime: string | null,
  plan: { minutes: number }[],
): { from: string; to: string }[] | null {
  if (!startTime || !/^\d{2}:\d{2}/.test(startTime)) return null;
  let at = 0;
  return plan.map((d) => {
    const slot = { from: clock(startTime, at), to: clock(startTime, at + d.minutes) };
    at += d.minutes;
    return slot;
  });
}
