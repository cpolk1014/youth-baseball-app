import { describe, expect, it } from "vitest";
import {
  byDay,
  cleanSchedule,
  cleanScores,
  matchScores,
  findTeamGame,
  gameKey,
  matchSchedule,
  ourSide,
  teamGameFor,
  teamIdFor,
  winner,
  type SavedGame,
  type ScoredGame,
  type ScheduleGame,
} from "./schedule";

const game = (over: Partial<ScheduleGame> = {}): ScheduleGame => ({
  gameNo: "1",
  stage: "pool",
  pool: "A",
  round: null,
  date: "2026-10-17",
  startTime: "09:00",
  venue: "Parkview",
  field: "Field 2",
  home: "Rattlers",
  away: "Tsunami 14u",
  ...over,
});
const saved = (over: Partial<SavedGame> = {}): SavedGame => ({
  id: "tg1",
  gameId: null,
  ...game(),
  ...over,
});

describe("cleanSchedule", () => {
  it("tidies games and drops ones without both sides or repeats", () => {
    const s = cleanSchedule({
      games: [
        {
          game_no: "Game #7",
          stage: "bracket",
          pool: null,
          round: " Semifinal ",
          date: "2026-10-18",
          start_time: "13:00",
          venue: null,
          field: "Field 1",
          home: "1st  Pool A",
          away: "2nd Pool B",
        },
        { game_no: "G7", stage: "bracket", home: "1st Pool A", away: "2nd Pool B" },
        {
          game_no: "2",
          stage: "pool",
          pool: "Pool B",
          date: "Oct 17",
          start_time: "9am",
          home: "Cubs",
          away: "",
        },
        {
          game_no: null,
          stage: "weird",
          pool: "Pool B",
          date: "2026-10-17",
          start_time: "25:00",
          home: "Cubs",
          away: "Sox",
        },
      ],
      warnings: ["Bracket times are TBD"],
    });
    expect(s.games).toEqual([
      {
        gameNo: "7",
        stage: "bracket",
        pool: null,
        round: "Semifinal",
        date: "2026-10-18",
        startTime: "13:00",
        venue: null,
        field: "Field 1",
        home: "1st Pool A",
        away: "2nd Pool B",
      },
      {
        gameNo: null,
        stage: "pool",
        pool: "B",
        round: null,
        date: "2026-10-17",
        startTime: null,
        venue: null,
        field: null,
        home: "Cubs",
        away: "Sox",
      },
    ]);
    expect(s.warnings).toEqual(["Bracket times are TBD"]);
  });

  it("survives an empty reply", () => {
    expect(cleanSchedule(null)).toEqual({ games: [], warnings: [] });
  });
});

describe("matchSchedule", () => {
  it("finds new, changed and unchanged games by game number", () => {
    const m = matchSchedule(
      [saved(), saved({ id: "tg2", gameNo: "2", home: "Cubs", away: "Sox" })],
      [
        game({ startTime: "09:30", field: "Field 3" }),
        game({ gameNo: "2", home: "Sox", away: "Cubs" }),
        game({ gameNo: "3", home: "A", away: "B" }),
      ],
    );
    expect(m.added.map((g) => g.gameNo)).toEqual(["3"]);
    expect(m.changed).toHaveLength(1);
    expect(m.changed[0]!.saved.id).toBe("tg1");
    expect(m.changed[0]!.changes).toEqual(["now 9:30 AM", "now at Parkview · Field 3"]);
    // Home and away swapped isn't a change worth flagging.
    expect(m.unchanged.map((g) => g.id)).toEqual(["tg2"]);
    expect(m.notShown).toEqual([]);
  });

  it("matches games without numbers by when, where and who, and keeps unseen ones", () => {
    const a = saved({ gameNo: null });
    const b = saved({ id: "tg2", gameNo: null, startTime: "11:00" });
    const m = matchSchedule(
      [a, b],
      [game({ gameNo: null, home: "Tsunami 14U", away: "rattlers" })],
    );
    expect(m.unchanged.map((g) => g.id)).toEqual(["tg1"]);
    expect(m.notShown.map((g) => g.id)).toEqual(["tg2"]);
    expect(gameKey(a)).not.toBe(gameKey(b));
  });

  it("flags a bracket placeholder replaced by a team", () => {
    const m = matchSchedule(
      [saved({ gameNo: "7", stage: "bracket", home: "1st Pool A", away: "2nd Pool B" })],
      [game({ gameNo: "7", stage: "bracket", home: "Rattlers", away: "2nd Pool B" })],
    );
    expect(m.changed[0]!.changes).toEqual(["now Rattlers vs 2nd Pool B"]);
  });
});

describe("our games", () => {
  it("finds our side and the opponent", () => {
    expect(ourSide(game(), "rattlers")).toEqual({ opponent: "Tsunami 14u" });
    expect(ourSide(game({ home: "Cubs" }), "Tsunami 14U")).toEqual({ opponent: "Cubs" });
    expect(ourSide(game(), "Cubs")).toBeNull();
    expect(ourSide(game(), null)).toBeNull();
  });

  it("links sides to tournament teams, not placeholders", () => {
    const teams = [{ id: "t1", name: "Tsunami 14U" }];
    expect(teamIdFor("tsunami 14u", teams)).toBe("t1");
    expect(teamIdFor("1st Pool A", teams)).toBeNull();
  });

  it("groups games by day in time order", () => {
    const days = byDay([
      game({ gameNo: "3", date: "2026-10-18", startTime: "09:00" }),
      game({ gameNo: "2", startTime: "11:00" }),
      game({ gameNo: "1" }),
      game({ gameNo: "9", date: null }),
    ]);
    expect(days.map((d) => [d.date, d.games.map((g) => g.gameNo)])).toEqual([
      ["2026-10-17", ["1", "2"]],
      ["2026-10-18", ["3"]],
      [null, ["9"]],
    ]);
  });
});

describe("team games", () => {
  const opts = { id: "g-new", seasonId: "s1", fieldPlayers: 9 as const, venues: ["Parkview"] };

  it("makes a team game for one of ours", () => {
    expect(teamGameFor(game({ venue: null }), "Tsunami 14u", { ...opts, existing: null })).toEqual({
      id: "g-new",
      seasonId: "s1",
      date: "2026-10-17",
      startTime: "09:00",
      opponent: "Tsunami 14u",
      location: "Parkview",
      field: "Field 2",
      innings: 6,
      fieldPlayers: 9,
      status: "scheduled",
    });
    expect(teamGameFor(game({ date: null }), "X", { ...opts, existing: null })).toBeNull();
  });

  it("updates the linked game but keeps its lineup settings and the map pin at the same park", () => {
    const existing = {
      id: "g1",
      seasonId: "s1",
      date: "2026-10-17",
      startTime: "08:00",
      opponent: "TBD",
      location: "Parkview",
      field: "Field 1",
      innings: 7,
      fieldPlayers: 10 as const,
      status: "scheduled" as const,
      lineupStyle: "competitive" as const,
      locationLat: 30.1,
    };
    const same = teamGameFor(game({ startTime: "09:30" }), "Tsunami 14u", { ...opts, existing });
    expect(same).toMatchObject({
      id: "g1",
      startTime: "09:30",
      opponent: "Tsunami 14u",
      field: "Field 2",
      innings: 7,
      lineupStyle: "competitive",
      locationLat: 30.1,
    });
    const moved = teamGameFor(game({ venue: "Burbank" }), "Tsunami 14u", { ...opts, existing });
    expect(moved).toMatchObject({ location: "Burbank", locationLat: null });
  });

  it("finds a team game the coach already added for that day and opponent", () => {
    const games = [
      {
        id: "a",
        seasonId: "s1",
        date: "2026-10-17",
        startTime: null,
        opponent: "tsunami 14U",
        location: null,
        innings: 6,
        fieldPlayers: 9 as const,
        status: "scheduled" as const,
      },
    ];
    expect(findTeamGame(game(), "Tsunami 14u", games, new Set())?.id).toBe("a");
    expect(findTeamGame(game(), "Tsunami 14u", games, new Set(["a"]))).toBeNull();
  });
});

describe("winner", () => {
  it("says who won once there's a score", () => {
    expect(winner({ scoreHome: 5, scoreAway: 7 })).toBe("away");
    expect(winner({ scoreHome: 8, scoreAway: 1 })).toBe("home");
    expect(winner({ scoreHome: 3, scoreAway: 3 })).toBe("tie");
    expect(winner({ scoreHome: null, scoreAway: null })).toBeNull();
  });
});

describe("scores from screenshots", () => {
  const savedGames: ScoredGame[] = [
    {
      id: "s1",
      gameNo: "1",
      date: "2026-11-14",
      home: "LA Mariners",
      away: "Mandeville Revolution",
      gameId: null,
      scoreHome: null,
      scoreAway: null,
      locked: false,
    },
    {
      id: "s2",
      gameNo: "2",
      date: "2026-11-14",
      home: "RBI Academy",
      away: "Bomb Squad",
      gameId: null,
      scoreHome: 0,
      scoreAway: 5,
      locked: false,
    },
    {
      id: "s3",
      gameNo: "3",
      date: "2026-11-14",
      home: "Bats",
      away: "Cubs",
      gameId: null,
      scoreHome: 1,
      scoreAway: 0,
      locked: true,
    },
    {
      id: "s4",
      gameNo: "4",
      date: "2026-11-14",
      home: "Knights",
      away: "Saints",
      gameId: "g1",
      scoreHome: null,
      scoreAway: null,
      locked: false,
    },
    {
      id: "s5",
      gameNo: "5",
      date: "2026-11-14",
      home: "Bomb Squad",
      away: "Saints",
      gameId: null,
      scoreHome: 13,
      scoreAway: 0,
      locked: false,
    },
  ];

  it("checks what Claude read", () => {
    expect(
      cleanScores({
        games: [
          { game_no: "G1", date: "2026-11-14", home: "A", away: "B", score_home: 5, score_away: 7 },
          { game_no: "2", date: "x", home: "A", away: "", score_home: 1, score_away: 0 },
          { game_no: "3", date: null, home: "A", away: "B", score_home: 120, score_away: 0 },
        ],
        warnings: [],
      }).games,
    ).toEqual([
      { gameNo: "1", date: "2026-11-14", home: "A", away: "B", scoreHome: 5, scoreAway: 7 },
    ]);
  });

  it("matches games and sorts out new, changed, same, locked and our own", () => {
    const { updates, unmatched } = matchScores(savedGames, [
      {
        gameNo: "1",
        date: null,
        home: "LA Mariners",
        away: "Mandeville Revolution",
        scoreHome: 5,
        scoreAway: 7,
      },
      // Listed the other way round, with no game number.
      {
        gameNo: null,
        date: null,
        home: "Bomb Squad",
        away: "RBI Academy",
        scoreHome: 6,
        scoreAway: 0,
      },
      { gameNo: "3", date: null, home: "Bats", away: "Cubs", scoreHome: 2, scoreAway: 0 },
      { gameNo: "4", date: null, home: "Knights", away: "Saints", scoreHome: 3, scoreAway: 1 },
      { gameNo: "5", date: null, home: "Bomb Squad", away: "Saints", scoreHome: 13, scoreAway: 0 },
      { gameNo: "9", date: null, home: "Nobody", away: "Else", scoreHome: 1, scoreAway: 0 },
    ]);
    expect(updates).toEqual([
      { id: "s1", scoreHome: 5, scoreAway: 7, status: "new", was: null },
      { id: "s2", scoreHome: 0, scoreAway: 6, status: "changed", was: [0, 5] },
      { id: "s3", scoreHome: 2, scoreAway: 0, status: "locked", was: [1, 0] },
      { id: "s4", scoreHome: 3, scoreAway: 1, status: "ours", was: null },
      { id: "s5", scoreHome: 13, scoreAway: 0, status: "same", was: null },
    ]);
    expect(unmatched.map((u) => u.home)).toEqual(["Nobody"]);
  });
});
