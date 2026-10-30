import { describe, expect, it } from "vitest";
import { makePlayer } from "@/lib/rules/test-utils";
import { battingCardModel, cardFileName } from "./battingCard";

const players = Array.from({ length: 16 }, (_, i) =>
  makePlayer(`p${i + 1}`, { name: `Kid ${i + 1}`, jerseyNumber: i + 2 }),
);

describe("batting order picture", () => {
  it("lists batters in order with jersey numbers, plus who sits and who's out", () => {
    const m = battingCardModel({
      teamName: "Canes 7U",
      opponent: "Lakeside",
      when: "Sat, Oct 24 · 9:00 AM",
      location: "Field 2",
      players,
      lineup: {
        innings: 6,
        battingOrder: ["p2", "p1"],
        notBatting: ["p3"],
        absent: ["p4"],
        slots: [],
      },
    });
    expect(m.matchup).toBe("vs Lakeside");
    expect(m.details).toBe("Sat, Oct 24 · 9:00 AM · Field 2");
    expect(m.batters).toEqual([
      { order: 1, name: "Kid 2", jersey: "3" },
      { order: 2, name: "Kid 1", jersey: "2" },
    ]);
    expect(m.notes).toEqual(["Not batting: Kid 3", "Out today: Kid 4"]);
    expect(m.columns).toBe(1);
  });

  it("switches to two columns and smaller rows for a long order", () => {
    const short = battingCardModel({
      teamName: "T",
      opponent: "O",
      when: "",
      location: null,
      players,
      lineup: { innings: 6, battingOrder: players.slice(0, 10).map((p) => p.id), slots: [] },
    });
    const long = battingCardModel({
      teamName: "T",
      opponent: "O",
      when: "",
      location: null,
      players,
      lineup: { innings: 6, battingOrder: players.map((p) => p.id), slots: [] },
    });
    expect(short.columns).toBe(1);
    expect(long.columns).toBe(2);
    expect(long.rowHeight * 8).toBeLessThanOrEqual(780);
    expect(long.fontSize).toBeLessThan(short.fontSize + 1);
  });

  it("names the file after the game", () => {
    expect(cardFileName("Canes 7U Polk", "Lakeside Lightning!")).toBe(
      "canes-7u-polk-vs-lakeside-lightning-batting-order.png",
    );
  });
});
