// A calendar file (iCalendar .ics) of practices, for Apple, Google and Outlook calendars
// (pure). Each practice keeps the same UID, so importing again updates it instead of adding
// a copy where the calendar supports that.
import { placeLabel } from "@/lib/data/game";
import type { Practice } from "@/lib/data/types";

/** Without an end time, a practice is put in as this long. */
const DEFAULT_MINUTES = 90;

/** Text escaped for iCalendar: backslashes, commas, semicolons and line breaks. */
export function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines over 75 bytes are folded onto continuation lines (a space starts each). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const ymd = (date: string) => date.replace(/-/g, "");
const hms = (time: string) => `${time.slice(0, 2)}${time.slice(3, 5)}00`;

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const d = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

export interface CalendarOptions {
  teamName: string;
  /** IANA time zone the practice times are in (the team's); without one they're local to the phone. */
  timezone?: string | null;
  /** The app's address, for a link back to each practice. */
  origin: string;
  /** When the file is made (DTSTAMP), as an ISO string. */
  now: string;
}

/** The UTC moment of a wall-clock time in an IANA time zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const offsetAt = (ms: number) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    return asUtc - ms;
  };
  // Twice, so a time near a daylight-saving change lands on the right offset.
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc);
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

/** One VEVENT for a practice. */
function practiceEvent(p: Practice, o: CalendarOptions): string[] {
  const when: string[] = [];
  if (p.startTime) {
    const end =
      p.endTime && p.endTime > p.startTime
        ? { date: p.date, time: p.endTime }
        : addMinutes(p.date, p.startTime, DEFAULT_MINUTES);
    // In the team's time zone, written as UTC (every calendar reads that right); without
    // one, as local time on the phone.
    const at = (date: string, time: string) =>
      o.timezone
        ? utcStamp(zonedToUtc(date, time.slice(0, 5), o.timezone))
        : `${ymd(date)}T${hms(time)}`;
    when.push(`DTSTART:${at(p.date, p.startTime)}`);
    when.push(`DTEND:${at(end.date, end.time)}`);
  } else {
    // No time yet: an all-day event.
    when.push(`DTSTART;VALUE=DATE:${ymd(p.date)}`);
  }
  const where = [placeLabel(p), p.locationAddress].filter(Boolean).join(", ");
  const link = `${o.origin}/practices/${p.id}`;
  const description = [
    p.focus ? `Focus: ${p.focus}` : null,
    p.plan.length
      ? `Drills: ${p.plan.map((d) => `${d.title} (${d.minutes} min)`).join("; ")}`
      : null,
    `In RallyCap: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
  const stamp = o.now.replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VEVENT",
    `UID:practice-${p.id}@rallycap.team`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${icsText(`${o.teamName} practice${p.focus ? `: ${p.focus}` : ""}`)}`,
    ...(where ? [`LOCATION:${icsText(where)}`] : []),
    ...(p.locationLat != null && p.locationLng != null
      ? [`GEO:${p.locationLat};${p.locationLng}`]
      : []),
    `DESCRIPTION:${icsText(description)}`,
    `URL:${link}`,
    "END:VEVENT",
  ];
}

/** A calendar file of the practices given (canceled ones are left out). */
export function practicesCalendar(practices: Practice[], o: CalendarOptions): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RallyCap//Practices//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`${o.teamName} practices`)}`,
    ...(o.timezone ? [`X-WR-TIMEZONE:${o.timezone}`] : []),
    ...practices.filter((p) => !p.canceled).flatMap((p) => practiceEvent(p, o)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A safe file name: "Riverside Rattlers practices.ics". */
export function calendarFileName(teamName: string, what = "practices"): string {
  const name = `${teamName} ${what}`
    .replace(/[^\w .-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${name || "RallyCap"}.ics`;
}
