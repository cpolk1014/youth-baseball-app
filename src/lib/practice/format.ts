import type { Practice } from "@/lib/data/types";

function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h! >= 12 ? "PM" : "AM";
  const hour = ((h! + 11) % 12) + 1;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "Tue, Nov 3 · 6–7:30 PM" */
export function formatPracticeWhen(p: Pick<Practice, "date" | "startTime" | "endTime">): string {
  const day = new Date(`${p.date}T12:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!p.startTime) return day;
  const start = time12(p.startTime);
  if (!p.endTime) return `${day} · ${start}`;
  const end = time12(p.endTime);
  // Drop the first AM/PM when both match: "6–7:30 PM".
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `${day} · ${sameHalf ? start.slice(0, -3) : start}–${end}`;
}
