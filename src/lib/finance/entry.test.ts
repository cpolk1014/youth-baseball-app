import { describe, expect, it } from "vitest";
import { eachLabel, sharesFor, summaryToShow } from "./entry";
import { formatCents } from "./money";

let n = 0;
const makeId = () => `id${++n}`;

describe("entry shares", () => {
  it("splits a Bat Around across players, adding up exactly", () => {
    const shares = sharesFor(
      { id: "e", type: "bat_around", amountCents: 803200 },
      Array.from({ length: 11 }, (_, i) => `p${i}`),
      makeId,
    );
    expect(shares).toHaveLength(11);
    expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(803200);
    expect(shares[0]).toMatchObject({ entryId: "e", playerId: "p0", amountCents: 73018 });
    expect(shares[10]?.amountCents).toBe(73019);
  });

  it("tags one-player types to one player and team types to nobody", () => {
    expect(sharesFor({ id: "e", type: "cleanup", amountCents: 500 }, ["p1"], makeId)).toMatchObject(
      [{ playerId: "p1", amountCents: 500 }],
    );
    expect(sharesFor({ id: "e", type: "safe_at_home", amountCents: 500 }, [], makeId)).toEqual([]);
    expect(sharesFor({ id: "e", type: "walkoff", amountCents: 500 }, ["p1"], makeId)).toEqual([]);
  });

  it("labels the per-player amount", () => {
    expect(eachLabel(110000, 11, formatCents)).toBe("$100.00 each");
    expect(eachLabel(803200, 11, formatCents)).toBe("$730.18–$730.19 each");
    expect(eachLabel(100, 0, formatCents)).toBe("");
  });

  it("uses the server summary only for people who can't see every entry", () => {
    const server = summaryToShow([], null, false);
    expect(server.totalInCents).toBe(0);
    const fake = { ...server, totalInCents: 999 };
    expect(summaryToShow([], fake, false).totalInCents).toBe(999);
    expect(summaryToShow([], fake, true).totalInCents).toBe(0);
  });
});
