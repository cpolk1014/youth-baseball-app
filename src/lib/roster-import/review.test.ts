import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/rules/types";
import { buildRosterReview, cleanRoster, readPositions, rowToPlayer } from "./review";

const player = (
  id: string,
  name: string,
  jerseyNumber: number | null,
  more: Partial<Player> = {},
): Player => ({
  id,
  name,
  jerseyNumber,
  preferredPositions: [],
  canPitch: false,
  canCatch: false,
  active: true,
  ...more,
});

describe("readPositions", () => {
  it("reads labels, words and groups", () => {
    expect(readPositions(["SS/2B", "Pitcher"])).toEqual(["SS", "2B", "P"]);
    expect(readPositions(["OF"])).toEqual(["LF", "CF", "RF"]);
    expect(readPositions(["c", "first base"])).toEqual(["C", "1B"]);
    expect(readPositions(["UTIL", "DH", ""])).toEqual([]);
  });
});

describe("cleanRoster", () => {
  it("keeps names, numbers 0-99, positions and pitch/catch; drops junk and repeats", () => {
    const { players, warnings } = cleanRoster({
      players: [
        {
          name: "  Jake   Polk ",
          number: "#7",
          positions: ["P", "SS"],
          pitcher: null,
          catcher: null,
        },
        { name: "Mason Reyes", number: "123", positions: [], pitcher: false, catcher: true },
        { name: "jake polk", number: "8", positions: [], pitcher: null, catcher: null },
        { name: "", number: "9", positions: [], pitcher: null, catcher: null },
        { name: "###", number: null, positions: [], pitcher: null, catcher: null },
      ],
      warnings: ["Row 4 was smudged", ""],
    });
    expect(players).toEqual([
      {
        name: "Jake Polk",
        jerseyNumber: 7,
        positions: ["P", "SS"],
        canPitch: true,
        canCatch: false,
      },
      { name: "Mason Reyes", jerseyNumber: null, positions: [], canPitch: false, canCatch: true },
    ]);
    expect(warnings).toEqual(["Row 4 was smudged"]);
  });

  it("survives a reply with nothing in it", () => {
    expect(cleanRoster(null)).toEqual({ players: [], warnings: [] });
  });
});

describe("buildRosterReview", () => {
  const roster = [
    player("a", "Jake P.", 6),
    player("b", "Eli Brooks", 7),
    player("c", "Old Kid", 9, { active: false }),
  ];
  const read = cleanRoster({
    players: [
      { name: "Jake Polk", number: "12", positions: ["1B"], pitcher: null, catcher: null },
      { name: "Mason Reyes", number: "7", positions: [], pitcher: null, catcher: null },
      { name: "Noah Gray", number: "9", positions: [], pitcher: null, catcher: null },
    ],
    warnings: [],
  }).players;

  it("finds who's already on the roster and numbers already worn", () => {
    const rows = buildRosterReview(read, roster);
    expect(rows[0]).toMatchObject({ existing: { id: "a" }, checked: false });
    expect(rows[1]).toMatchObject({ existing: null, numberTakenBy: { id: "b" }, checked: true });
    // An inactive player's old number doesn't count.
    expect(rows[2]).toMatchObject({ existing: null, numberTakenBy: null, checked: true });
  });

  it("adds new players, and updates existing ones without taking anything away", () => {
    const rows = buildRosterReview(read, [
      player("a", "Jake P.", 6, { preferredPositions: ["SS"], canPitch: true }),
    ]);
    expect(rowToPlayer(rows[0]!, () => "new")).toMatchObject({
      id: "a",
      name: "Jake P.",
      jerseyNumber: 12,
      preferredPositions: ["SS", "1B"],
      canPitch: true,
    });
    expect(rowToPlayer(rows[2]!, () => "new")).toMatchObject({
      id: "new",
      name: "Noah Gray",
      jerseyNumber: 9,
    });
  });

  it("matches a roster player to one line only", () => {
    const lines = cleanRoster({
      players: [
        { name: "Mason R.", number: "2", positions: [], pitcher: null, catcher: null },
        { name: "Mason Reyes", number: "5", positions: [], pitcher: null, catcher: null },
      ],
      warnings: [],
    }).players;
    const rows = buildRosterReview(lines, [player("m", "Mason R.", 2)]);
    expect(rows[0]!.existing?.id).toBe("m");
    expect(rows[1]!.existing).toBeNull();
  });
});
