import { describe, expect, it } from "vitest";
import type { Lineup, Player } from "@/lib/rules/types";
import { batAroundMessage, battingOrderMessage, splitMessage } from "./messages";

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

describe("battingOrderMessage", () => {
  it("lists the batting order, who sits out, and who's missing", () => {
    const players = [
      player("a", "Mason R."),
      player("b", "Leo T."),
      player("c", "Eli M."),
      player("d", "Sam P."),
    ];
    const lineup: Lineup = {
      innings: 6,
      battingOrder: ["b", "a"],
      notBatting: ["c"],
      absent: ["d"],
      slots: [],
    };
    expect(
      battingOrderMessage({
        opponent: "Lakeside Lightning",
        when: "Sat, Oct 24 · 9:00 AM",
        location: "Memorial Park Field 2",
        players,
        lineup,
      }),
    ).toBe(
      [
        "⚾ Batting order: vs Lakeside Lightning",
        "Sat, Oct 24 · 9:00 AM · Memorial Park Field 2",
        "",
        "1. Leo T.",
        "2. Mason R.",
        "",
        "Not batting today: Eli M.",
        "",
        "Not at this game: Sam P.",
        "",
        "Sent from RallyCap.",
      ].join("\n"),
    );
  });
});

describe("batAroundMessage", () => {
  const base = {
    title: "Pigeon Forge World Series ",
    totalCents: 120000,
    players: 12,
    each: "$100.00",
    link: "https://www.rallycap.team/money",
    format: (c: number) => `$${(c / 100).toFixed(2)}`,
    formatDate: (d: string) => d,
  };

  it("gives the total, each family's share and the payment schedule", () => {
    expect(
      batAroundMessage({
        ...base,
        installments: [
          { dueDate: "Jan 15", amountCents: 2500 },
          { dueDate: "Feb 15", amountCents: 2500 },
          { dueDate: "Mar 15", amountCents: 2500 },
          { dueDate: "Apr 15", amountCents: 2500 },
        ],
      }),
    ).toBe(
      [
        "💵 New team expense: Pigeon Forge World Series",
        "$1200.00 total, split 12 ways: $100.00 per player.",
        "",
        "4 payments:",
        "• $25.00 due Jan 15",
        "• $25.00 due Feb 15",
        "• $25.00 due Mar 15",
        "• $25.00 due Apr 15",
        "",
        "See your balance in RallyCap: https://www.rallycap.team/money",
      ].join("\n"),
    );
  });

  it("gives one due date for a single payment", () => {
    const text = batAroundMessage({
      ...base,
      installments: [{ dueDate: "Nov 1", amountCents: 10000 }],
    });
    expect(text).toContain("$100.00 per player.\nDue Nov 1.");
  });
});
