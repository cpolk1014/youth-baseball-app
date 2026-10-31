import { describe, expect, it } from "vitest";
import { parseGameChangerStats } from "./gamechanger";
import { inningsValue, statLines } from "./profile";

const FILE = [
  ",,,Batting,,,,Pitching,,,Fielding,,,,",
  "Number,Last,First,PA,OBP,SLG,OPS,IP,ERA,WHIP,TC,FPCT,P,SS,LF",
  "7,Martin,Luke,40,0.400,0.500,0.900,12.2,3.5,1.25,30,0.933,12.2,20.1,0",
  "9,Polk,Jake,10,-,-,-,0,-,-,0,-,0,0,15",
  "3,Visitor,Sam,5,0.2,0.2,0.4,0,-,-,0,-,0,0,0",
].join("\n");

describe("inningsValue", () => {
  it("reads thirds of an inning", () => {
    expect(inningsValue("36.1")).toBeCloseTo(36 + 1 / 3);
    expect(inningsValue("4.2")).toBeCloseTo(4 + 2 / 3);
    expect(inningsValue("9")).toBe(9);
    expect(inningsValue("-")).toBeNull();
    expect(inningsValue("4.5")).toBeNull();
  });
});

describe("statLines", () => {
  const stats = parseGameChangerStats(FILE);
  stats.players[0]!.playerId = "luke";
  stats.players[1]!.playerId = "jake";

  it("reads the numbers competitive lineups use, for matched players only", () => {
    const lines = statLines(stats);
    expect([...lines.keys()]).toEqual(["luke", "jake"]);
    const luke = lines.get("luke")!;
    expect(luke).toMatchObject({
      pa: 40,
      obp: 0.4,
      ops: 0.9,
      whip: 1.25,
      chances: 30,
      fpct: 0.933,
    });
    expect(luke.ip).toBeCloseTo(12 + 2 / 3);
    expect(luke.innings.SS).toBeCloseTo(20 + 1 / 3);
    expect(luke.innings.LF).toBeUndefined();
  });

  it("leaves placeholders empty", () => {
    expect(statLines(stats).get("jake")).toMatchObject({
      obp: null,
      ip: 0,
      whip: null,
      innings: { LF: 15 },
    });
  });
});
