import { describe, expect, it } from "vitest";
import { draftToRule, interpretationSchema, type DraftRule } from "./interpret";

const players = [
  { id: "p1", name: "Mason R." },
  { id: "p2", name: "Owen K." },
];
const blank: DraftRule = {
  kind: "position-min",
  positions: [],
  innings: null,
  playerName: null,
  position: null,
  inning: null,
  strict: true,
};

describe("interpreting typed rules", () => {
  it("turns complete drafts into rules, mapping names to players", () => {
    expect(
      draftToRule({ ...blank, positions: ["LF", "CF", "RF"], innings: 2 }, players, "a"),
    ).toEqual({
      id: "a",
      setting: "block",
      kind: "position-min",
      positions: ["LF", "CF", "RF"],
      innings: 2,
    });
    expect(
      draftToRule(
        { ...blank, kind: "never-plays", playerName: "Owen K.", positions: ["P"], strict: false },
        players,
        "b",
      ),
    ).toEqual({ id: "b", setting: "warn", kind: "never-plays", playerId: "p2", positions: ["P"] });
    expect(
      draftToRule(
        { ...blank, kind: "locked", playerName: "Mason R.", position: "P", inning: 1 },
        players,
        "c",
      ),
    ).toMatchObject({ kind: "locked", playerId: "p1", position: "P", inning: 1 });
    expect(draftToRule({ ...blank, kind: "leadoff-rotation" }, players, "d")).toMatchObject({
      kind: "leadoff-rotation",
    });
  });

  it("rejects incomplete or out-of-range drafts", () => {
    expect(draftToRule({ ...blank, positions: ["LF"], innings: null }, players, "x")).toBeNull();
    expect(draftToRule({ ...blank, positions: ["LF"], innings: 12 }, players, "x")).toBeNull();
    expect(
      draftToRule(
        { ...blank, kind: "never-plays", playerName: "Nobody", positions: ["P"] },
        players,
        "x",
      ),
    ).toBeNull();
    expect(
      draftToRule(
        { ...blank, kind: "locked", playerName: "Mason R.", position: null, inning: 1 },
        players,
        "x",
      ),
    ).toBeNull();
  });

  it("limits player names in the schema to the roster", () => {
    const schema = interpretationSchema(["Mason R."]);
    const item = schema.properties.rules.items.properties.playerName;
    expect(JSON.stringify(item)).toContain("Mason R.");
    expect(interpretationSchema([]).properties.rules.items.properties.playerName).toEqual({
      type: "null",
    });
  });
});
