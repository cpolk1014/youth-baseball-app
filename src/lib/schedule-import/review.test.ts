import { describe, expect, it } from "vitest";
import type { Game, Practice } from "@/lib/data/types";
import { buildImportReview, toGame, toPractice } from "./review";
import type { ScheduleExtraction } from "./schema";

const extraction: ScheduleExtraction = {
  practices: [
    {
      date: "2026-11-18",
      start_time: "17:30",
      end_time: "19:30",
      location: "Chabill's Field",
      note: null,
    },
    {
      date: "2026-11-16",
      start_time: "17:30",
      end_time: "19:30",
      location: "Chabill's Field",
      note: null,
    },
    { date: "2026-13-40", start_time: "17:30", end_time: null, location: null, note: null },
    {
      date: "2026-11-30",
      start_time: "5:30 PM",
      end_time: "19:30",
      location: null,
      note: "Bring gloves",
    },
  ],
  games: [
    {
      date: "2027-02-22",
      start_time: null,
      opponent: null,
      location: null,
      note: "Monday night league",
      tentative: false,
    },
    {
      date: "2027-05-05",
      start_time: null,
      opponent: null,
      location: null,
      note: "Rain make-up day",
      tentative: true,
    },
    {
      date: "not a date",
      start_time: null,
      opponent: "X",
      location: null,
      note: null,
      tentative: false,
    },
  ],
  warnings: ["Year assumed from Monday weekdays."],
};

const existingPractice = { date: "2026-11-18", startTime: "17:30" } as Practice;
const existingGame = { date: "2027-02-22" } as Game;

describe("buildImportReview", () => {
  let n = 0;
  const review = buildImportReview(
    extraction,
    [existingPractice],
    [existingGame],
    () => `id-${++n}`,
  );

  it("drops invalid dates, sorts by date, and keeps warnings", () => {
    expect(review.practices.map((p) => p.date)).toEqual(["2026-11-16", "2026-11-18", "2026-11-30"]);
    expect(review.games.map((g) => g.date)).toEqual(["2027-02-22", "2027-05-05"]);
    expect(review.skipped).toBe(2);
    expect(review.warnings).toEqual(["Year assumed from Monday weekdays."]);
  });

  it("gives every row its own id", () => {
    const ids = [...review.practices, ...review.games].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("unchecks duplicates and tentative games; clears unreadable times", () => {
    const byDate = Object.fromEntries(review.practices.map((p) => [p.date, p]));
    expect(byDate["2026-11-16"]).toMatchObject({ selected: true, duplicate: false });
    expect(byDate["2026-11-18"]).toMatchObject({ selected: false, duplicate: true });
    expect(byDate["2026-11-30"]?.startTime).toBeNull();
    expect(review.games[0]).toMatchObject({ selected: false, duplicate: true });
    expect(review.games[1]).toMatchObject({ selected: false, tentative: true });
  });

  it("drops end times that aren't after the start", () => {
    const r = buildImportReview(
      {
        practices: [
          {
            date: "2026-11-16",
            start_time: "18:00",
            end_time: "17:00",
            location: null,
            note: null,
          },
        ],
        games: [],
        warnings: [],
      },
      [],
      [],
    );
    expect(r.practices[0]).toMatchObject({ startTime: "18:00", endTime: null });
  });
});

describe("converters", () => {
  let n = 0;
  const review = buildImportReview(extraction, [], [], () => `id-${++n}`);

  it("makes practices with notes carried over, keeping the review's id", () => {
    const p = toPractice(review.practices[2]!, "season-1");
    expect(p).toMatchObject({
      id: review.practices[2]!.id,
      seasonId: "season-1",
      date: "2026-11-30",
      notes: "Bring gloves",
      plan: [],
      canceled: false,
    });
  });

  it("makes games with TBD opponents and the team's default field size", () => {
    const g = toGame(review.games[0]!, { seasonId: "season-1", fieldPlayers: 10 });
    expect(g).toMatchObject({
      id: review.games[0]!.id,
      opponent: "TBD",
      innings: 6,
      fieldPlayers: 10,
      status: "scheduled",
    });
  });
});
