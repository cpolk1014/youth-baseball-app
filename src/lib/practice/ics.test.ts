import { describe, expect, it } from "vitest";
import type { Practice } from "@/lib/data/types";
import { calendarFileName, foldLine, icsText, practicesCalendar, zonedToUtc } from "./ics";

const practice = (over: Partial<Practice> = {}): Practice => ({
  id: "p1",
  seasonId: "s",
  date: "2026-11-18",
  startTime: "18:00",
  endTime: "19:30",
  location: "Bayou Park",
  field: "Field 7",
  locationAddress: "100 Main St, Lafayette, LA",
  focus: "Hitting",
  notes: null,
  plan: [{ id: "d", title: "Tee work", minutes: 20 }],
  canceled: false,
  plays: [],
  ...over,
});
const opts = {
  teamName: "Riverside Rattlers",
  timezone: "America/Chicago",
  origin: "https://www.fungo.team",
  now: "2026-11-17T15:04:05.123Z",
};
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("practicesCalendar", () => {
  it("makes one event per practice in the team's time zone", () => {
    const ics = unfold(practicesCalendar([practice()], opts));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
    expect(ics).toContain("UID:practice-p1@rallycap.team");
    expect(ics).toContain("DTSTAMP:20261117T150405Z");
    // 6 PM in Chicago in November (CST, UTC-6) is midnight UTC.
    expect(ics).toContain("DTSTART:20261119T000000Z");
    expect(ics).toContain("DTEND:20261119T013000Z");
    expect(ics).toContain("SUMMARY:Riverside Rattlers practice: Hitting");
    expect(ics).toContain("LOCATION:Bayou Park · Field 7\\, 100 Main St\\, Lafayette\\, LA");
    expect(ics).toContain("Drills: Tee work (20 min)");
    expect(ics).toContain("URL:https://www.fungo.team/practices/p1");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("runs 90 minutes without an end time, and all day without a start", () => {
    const ics = practicesCalendar(
      [practice({ endTime: null }), practice({ id: "p2", startTime: null })],
      { ...opts, timezone: null },
    );
    expect(ics).toContain("DTSTART:20261118T180000");
    expect(ics).toContain("DTEND:20261118T193000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261118");
  });

  it("leaves canceled practices out", () => {
    expect(practicesCalendar([practice({ canceled: true })], opts)).not.toContain("BEGIN:VEVENT");
  });
});

describe("helpers", () => {
  it("turns team-local times into UTC, daylight saving included", () => {
    expect(zonedToUtc("2026-07-01", "18:00", "America/Chicago").toISOString()).toBe(
      "2026-07-01T23:00:00.000Z",
    );
    expect(zonedToUtc("2026-11-18", "18:00", "America/New_York").toISOString()).toBe(
      "2026-11-18T23:00:00.000Z",
    );
    // The morning clocks spring forward.
    expect(zonedToUtc("2027-03-14", "09:00", "America/Chicago").toISOString()).toBe(
      "2027-03-14T14:00:00.000Z",
    );
  });

  it("escapes text", () => {
    expect(icsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });

  it("folds long lines at 75 bytes", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(200)}`);
    expect(folded.split("\r\n ").every((l) => l.length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(200)}`);
  });

  it("names the file after the team", () => {
    expect(calendarFileName("Traction Canes 7U / Polk")).toBe(
      "Traction Canes 7U Polk practices.ics",
    );
  });
});
