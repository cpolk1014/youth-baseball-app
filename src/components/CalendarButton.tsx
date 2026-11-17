"use client";

import type { Practice } from "@/lib/data/types";
import { calendarFileName, practicesCalendar } from "@/lib/practice/ics";
import { toast } from "./shell/Toast";

/**
 * Downloads a calendar file (.ics) of practices to import into Apple, Google or Outlook
 * calendar. On a phone, opening the file offers to add the practices.
 */
export function CalendarButton({
  practices,
  teamName,
  timezone,
  label = "Add to calendar",
  what = "practices",
  className = "",
}: {
  practices: Practice[];
  teamName: string;
  timezone?: string | null;
  label?: string;
  /** For the file name: "practices" or "practice Nov 18". */
  what?: string;
  className?: string;
}) {
  const count = practices.filter((p) => !p.canceled).length;
  const download = () => {
    const ics = practicesCalendar(practices, {
      teamName,
      timezone,
      origin: window.location.origin,
      now: new Date().toISOString(),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = calendarFileName(teamName, what);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(
      `Downloaded ${count} practice${count === 1 ? "" : "s"}. Open the file to add ${count === 1 ? "it" : "them"} to your calendar.`,
    );
  };
  return (
    <button
      onClick={download}
      disabled={count === 0}
      className={`flex h-11 items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-bold text-slate-800 active:bg-slate-100 disabled:opacity-40 ${className}`}
    >
      <span aria-hidden="true">📅</span> {label}
    </button>
  );
}
