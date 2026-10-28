import { describe, expect, it } from "vitest";
import type { Lineup, Player } from "@/lib/rules/types";
import { lineupMessage, splitMessage } from "./messages";

const player = (id: string, name: string): Player => ({
  id,
  name,
  preferredPositions: [],
  canPitch: true,
  canCatch: true,
});

describe("splitMessage", () => {
  it("keeps short messages whole", () => {
    expect(splitMessage("hello\nteam")).toEqual(["hello\nteam"]);
  });

  it("breaks long messages between lines, each part within the limit", () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i} ${"x".repeat(40)}`).join("\n");
    const parts = splitMessage(text, 200);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join("\n")).toBe(text);
  });

  it("cuts a single very long line", () => {
    expect(splitMessage("a".repeat(25), 10)).toEqual([
      "a".repeat(10),
      "a".repeat(10),
      "a".repeat(5),
    ]);
  });
});

describe("lineupMessage", () => {
  it("lists each kid in batting order with their spot each inning", () => {
    const players = [
      player("a", "Mason R."),
      player("b", "Leo T."),
      player("c", "Eli M."),
      player("d", "Sam P."),
    ];
    const lineup: Lineup = {
      innings: 2,
      battingOrder: ["b", "a"],
      notBatting: ["c"],
      absent: ["d"],
      slots: [
        { inning: 1, playerId: "a", position: "P" },
        { inning: 1, playerId: "b", position: "C" },
        { inning: 1, playerId: "c", position: "BENCH" },
        { inning: 2, playerId: "a", position: "SS" },
        { inning: 2, playerId: "b", position: "BENCH" },
      ],
    };
    const text = lineupMessage({
      opponent: "Lakeside Lightning",
      when: "Sat, Oct 24 · 9:00 AM",
      location: "Memorial Park Field 2",
      players,
      lineup,
      fieldPositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
    });
    expect(text).toBe(
      [
        "⚾ Lineup: vs Lakeside Lightning",
        "Sat, Oct 24 · 9:00 AM · Memorial Park Field 2",
        "",
        "Innings 1–2:",
        "1. Leo T. · C BN",
        "2. Mason R. · P SS",
        "",
        "Not batting today:",
        "Eli M. · BN —",
        "",
        "Not at this game: Sam P.",
        "",
        "BN = bench. Sent from RallyCap.",
      ].join("\n"),
    );
  });
});
