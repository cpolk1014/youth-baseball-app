import { describe, expect, it } from "vitest";
import { matchLines, type RosterKid } from "./team";

const roster: RosterKid[] = [
  { id: "mason", name: "Mason Reyes", jerseyNumber: 7 },
  { id: "jake", name: "Jake M.", jerseyNumber: 6 },
  { id: "jack", name: "Jack M.", jerseyNumber: null },
  { id: "eli", name: "Eli Brooks", jerseyNumber: 2 },
];

describe("matchLines", () => {
  it("matches by number when the name agrees", () => {
    expect(matchLines([{ boxName: "M Reyes", boxNumber: "#7" }], roster)).toEqual([
      { playerId: "mason", matchedBy: "number" },
    ]);
  });

  it("falls back to the name when there's no number, or the number is wrong", () => {
    expect(
      matchLines(
        [
          { boxName: "E Brooks", boxNumber: null },
          { boxName: "Mason Reyes", boxNumber: "17" },
        ],
        roster,
      ),
    ).toEqual([
      { playerId: "eli", matchedBy: "name" },
      { playerId: "mason", matchedBy: "name" },
    ]);
  });

  it("leaves a name that fits two kids (or none) for the coach", () => {
    expect(
      matchLines(
        [
          { boxName: "J M", boxNumber: null },
          { boxName: "Z Smith", boxNumber: "44" },
        ],
        roster,
      ),
    ).toEqual([
      { playerId: null, matchedBy: null },
      { playerId: null, matchedBy: null },
    ]);
  });

  it("never matches a kid twice", () => {
    const m = matchLines(
      [
        { boxName: "Mason Reyes", boxNumber: "7" },
        { boxName: "M Reyes", boxNumber: null },
      ],
      roster,
    );
    expect(m[0]!.playerId).toBe("mason");
    expect(m[1]!.playerId).toBeNull();
  });
});
