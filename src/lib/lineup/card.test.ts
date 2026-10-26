import { describe, expect, it } from "vitest";
import { lineupFromGrid, makePlayer } from "@/lib/rules/test-utils";
import { buildLineupCard } from "./card";

const players = [
  makePlayer("a", { name: "Ava J.", jerseyNumber: 8 }),
  makePlayer("b", { name: "Ben K." }),
];

describe("buildLineupCard", () => {
  it("lists batters in order with positions per inning and BN for bench", () => {
    const lineup = lineupFromGrid({ a: ["P", "BENCH"], b: ["C", "P"] }, ["b", "a"]);
    const card = buildLineupCard(players, lineup, ["P", "C"]);
    expect(card.rows).toEqual([
      { order: 1, playerId: "b", name: "Ben K.", jersey: "", positions: ["C", "P"] },
      { order: 2, playerId: "a", name: "Ava J.", jersey: "8", positions: ["P", "BN"] },
    ]);
    expect(card.complete).toBe(true);
  });

  it("builds defense by inning, blank where a position is open", () => {
    const lineup = lineupFromGrid({ a: ["P", "BENCH"], b: ["C", "P"] });
    const card = buildLineupCard(players, lineup, ["P", "C"]);
    expect(card.defense).toEqual([
      { position: "P", players: ["#8 Ava", "Ben"] },
      { position: "C", players: ["Ben", ""] },
    ]);
  });

  it("marks the card incomplete when a spot is unset", () => {
    const lineup = lineupFromGrid({ a: ["P"], b: [] });
    lineup.innings = 1;
    const card = buildLineupCard(players, lineup, ["P"]);
    expect(card.rows[1]?.positions).toEqual([""]);
    expect(card.complete).toBe(false);
  });

  it("lists players sitting out of batting last, without a batting slot", () => {
    const lineup = { ...lineupFromGrid({ a: ["P"], b: ["C"] }, ["b"]), notBatting: ["a"] };
    lineup.innings = 1;
    const card = buildLineupCard(players, lineup, ["P", "C"]);
    expect(card.rows.map((r) => [r.order, r.name])).toEqual([
      [1, "Ben K."],
      [null, "Ava J."],
    ]);
  });
});
