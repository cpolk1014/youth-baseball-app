import { describe, expect, it } from "vitest";
import {
  emptyIn,
  lowerIsBetter,
  matchRoster,
  parseCsv,
  parseGameChangerStats,
  statGroups,
  statNumber,
} from "./gamechanger";

const FILE = [
  ",,,Batting,,,Pitching,,Fielding",
  "Number,Last,First,GP,AVG,H,IP,H,E,FPCT",
  "7,Martin,Luke,10,0.333,5,4.1,3,1,0.900",
  "21,Chenevert,John Ryan,9,0.250,3,0,0,0,1",
  "99,Visitor,Sam,2,-,0,N/A,0,0,-",
  "Totals,,,10,0.300,8,4.1,3,1,0.95",
  ",,,,,,,,,",
  'Glossary,,,GP=Games played,AVG=Batting average,H=Hits,IP=Innings pitched,H=Hits allowed,E=Errors,"FPCT=Fielding, percentage"',
].join("\r\n");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('a,"b,c","say ""hi""\nthere"\r\nd,,e')).toEqual([
      ["a", "b,c", 'say "hi"\nthere'],
      ["d", "", "e"],
    ]);
  });

  it("drops a byte order mark", () => {
    expect(parseCsv("﻿Number,Last")).toEqual([["Number", "Last"]]);
  });
});

describe("parseGameChangerStats", () => {
  const stats = parseGameChangerStats(FILE);

  it("reads groups, columns and glossary descriptions", () => {
    expect(statGroups(stats)).toEqual(["Batting", "Pitching", "Fielding"]);
    expect(stats.columns[2]).toEqual({ group: "Batting", key: "H", description: "Hits" });
    expect(stats.columns[4]).toEqual({ group: "Pitching", key: "H", description: "Hits allowed" });
    expect(stats.columns[6]?.description).toBe("Fielding, percentage");
  });

  it("reads players and totals, skipping blank rows", () => {
    expect(stats.players.map((p) => `${p.number} ${p.first} ${p.last}`)).toEqual([
      "7 Luke Martin",
      "21 John Ryan Chenevert",
      "99 Sam Visitor",
    ]);
    expect(stats.players[0]?.values).toEqual(["10", "0.333", "5", "4.1", "3", "1", "0.900"]);
    expect(stats.totals?.[1]).toBe("0.300");
  });

  it("refuses a file that isn't the export", () => {
    expect(() => parseGameChangerStats("Name,Score\nA,1")).toThrow(/GameChanger/);
    expect(() => parseGameChangerStats(",,,Batting\nNumber,Last,First,GP\nTotals,,,0")).toThrow(
      /no players/,
    );
  });
});

describe("matchRoster", () => {
  const stats = parseGameChangerStats(FILE);
  it("matches by full name, first name + last initial, then a unique number", () => {
    const roster = [
      { id: "luke", name: "Luke M.", jerseyNumber: 3 },
      { id: "jr", name: "John Ryan Chenevert", jerseyNumber: 21 },
      { id: "other", name: "Sam Other", jerseyNumber: 99 },
    ];
    expect(matchRoster(stats.players, roster)).toEqual(["luke", "jr", "other"]);
  });

  it("matches a number with a nickname, but not a number alone", () => {
    const roster = [
      { id: "lm", name: "Lukey Martin", jerseyNumber: 7 },
      { id: "eli", name: "Eli M.", jerseyNumber: 21 },
    ];
    expect(matchRoster(stats.players, roster)).toEqual(["lm", null, null]);
  });

  it("leaves players nobody matches, and uses each roster player once", () => {
    const roster = [{ id: "jr", name: "John Ryan Chenevert", jerseyNumber: 7 }];
    expect(matchRoster(stats.players, roster)).toEqual([null, "jr", null]);
  });
});

describe("helpers", () => {
  it("reads numbers and skips placeholders", () => {
    expect(statNumber("0.305")).toBe(0.305);
    expect(statNumber("89.11")).toBe(89.11);
    expect(statNumber("-")).toBeNull();
    expect(statNumber("N/A")).toBeNull();
    expect(statNumber("10-Sep")).toBeNull();
  });

  it("spots a player with nothing in a group", () => {
    expect(emptyIn(["0", "-", "N/A", "0-0", ""], [0, 1, 2, 3, 4])).toBe(true);
    expect(emptyIn(["0", "4.1"], [0, 1])).toBe(false);
  });

  it("knows which stats are better low, by group", () => {
    expect(lowerIsBetter({ group: "Pitching", key: "ERA", description: null })).toBe(true);
    expect(lowerIsBetter({ group: "Batting", key: "H", description: null })).toBe(false);
    expect(lowerIsBetter({ group: "Pitching", key: "H", description: null })).toBe(true);
  });
});
