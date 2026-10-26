// Practice scheduling: pure helpers (no I/O).

export interface PlanItem {
  id: string;
  title: string;
  minutes: number;
  notes?: string;
}

const MAX_GENERATED = 120;

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dates (YYYY-MM-DD) on the chosen weekdays (0 = Sunday … 6 = Saturday) from start to end,
 * inclusive. Capped so a mistyped year can't create thousands of practices.
 */
export function generatePracticeDates({
  start,
  end,
  weekdays,
}: {
  start: string;
  end: string;
  weekdays: number[];
}): string[] {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to || from > to || weekdays.length === 0) return [];
  const days = new Set(weekdays);
  const out: string[] = [];
  for (const d = from; d <= to && out.length < MAX_GENERATED; d.setUTCDate(d.getUTCDate() + 1)) {
    if (days.has(d.getUTCDay())) out.push(formatDate(d));
  }
  return out;
}

export function planMinutes(plan: PlanItem[]): number {
  return plan.reduce((sum, item) => sum + item.minutes, 0);
}

/** Scheduled length in minutes, or null if the times are missing or backwards. */
export function practiceMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(end) - toMin(start);
  return diff > 0 ? diff : null;
}

/** Move a drill one place up (-1) or down (+1). */
export function movePlanItem(plan: PlanItem[], index: number, delta: -1 | 1): PlanItem[] {
  const to = index + delta;
  if (index < 0 || index >= plan.length || to < 0 || to >= plan.length) return plan;
  const next = [...plan];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}
