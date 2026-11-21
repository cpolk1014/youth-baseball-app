import { describe, expect, it } from "vitest";
import {
  chargesPush,
  chatterPush,
  coachPush,
  dayText,
  gamesPush,
  keyBytes,
  postLine,
  timeText,
} from "./payload";

describe("team notices", () => {
  it("formats days and times", () => {
    expect(dayText("2026-11-22")).toBe("Sun, Nov 22");
    expect(timeText("19:00:00")).toBe("7:00 PM");
    expect(timeText("00:30")).toBe("12:30 AM");
    expect(timeText(null)).toBe("");
  });

  it("says one game change plainly and opens the game", () => {
    const base = {
      ref: "g1",
      date: "2026-11-22",
      opponent: "Cubs",
      time: "19:00",
      where: "Chabills Field",
    };
    expect(gamesPush("t", "10U Canes", [{ ...base, change: "added" }]).body).toBe(
      "New game: Sun, Nov 22 vs Cubs · 7:00 PM · Chabills Field",
    );
    const changed = gamesPush("t", "10U Canes", [
      { ...base, change: "changed", changed: ["time", "where"] },
    ]);
    expect(changed.body).toBe(
      "Game update: Sun, Nov 22 vs Cubs · now 7:00 PM, now at Chabills Field",
    );
    expect(changed.url).toBe("/games/g1");
    const off = gamesPush("t", "10U Canes", [{ ...base, change: "removed" }]);
    expect(off.body).toBe("Off the schedule: Sun, Nov 22 vs Cubs");
    expect(off.url).toBe("/games");
  });

  it("rolls several changes into one notice", () => {
    const p = gamesPush("t", "10U Canes", [
      { change: "added", ref: "a", date: "2026-11-22", opponent: "Cubs" },
      { change: "changed", ref: "b", date: "2026-11-23", opponent: "Rays", changed: ["time"] },
    ]);
    expect(p.body).toBe("2 schedule changes: Sun vs Cubs (new), Mon vs Rays (changed)");
    expect(p.url).toBe("/games");
    expect(p.tag).toBe("games-t");
  });

  it("tells a family about new charges", () => {
    expect(
      chargesPush("t", "10U Canes", [
        {
          change: "charge",
          ref: "e",
          title: "Tournament fee",
          cents: 4500,
          player: "Mason",
          due: "2027-01-15",
        },
      ]).body,
    ).toBe("New charge for Mason: Tournament fee · $45.00, due Jan 15");
    expect(
      chargesPush("t", "10U Canes", [
        { change: "charge", ref: "e", title: "Fee", cents: 4500, player: "Mason" },
        { change: "charge", ref: "f", title: "Hotel", cents: 12000, player: "Ella" },
      ]).body,
    ).toBe("2 new charges for Mason & Ella: Fee ($45.00), Hotel ($120.00)");
  });
});

describe("push payloads", () => {
  it("says a post in one line", () => {
    expect(postLine({ body: "Practice\n moved   to 6" })).toBe("Practice moved to 6");
    expect(postLine({ body: "", photos: [{}] })).toBe("📷 Photo");
    expect(postLine({ body: "Great game", photos: [{}, {}] })).toBe("📷 2 photos · Great game");
    expect(postLine({ body: "Pizza or tacos?", kind: "poll" })).toBe("📊 Poll: Pizza or tacos?");
  });

  it("names the team and who posted, and opens that team's Chatter", () => {
    const p = chatterPush({
      teamId: "t1",
      teamName: "10U Canes",
      from: "Dana Reyes",
      post: { body: "Bring water" },
    });
    expect(p).toEqual({
      title: "10U Canes",
      body: "Dana Reyes: Bring water",
      url: "/chatter?team=t1",
      tag: "chatter-t1",
    });
  });

  it("keeps long posts short", () => {
    const p = chatterPush({
      teamId: "t",
      teamName: "T",
      from: "A",
      post: { body: "x".repeat(400) },
    });
    expect(p.body.length).toBe(160);
    expect(p.body.endsWith("…")).toBe(true);
  });

  it("labels Coach Chatter by club", () => {
    const p = coachPush({ clubId: "c", clubName: "Bayou", from: "Director", post: { body: "Hi" } });
    expect(p.title).toBe("Coach Chatter · Bayou");
    expect(p.url).toBe("/coach-chatter?club=c");
  });

  it("decodes the public key", () => {
    expect(Array.from(keyBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(keyBytes("_-8"))).toEqual([255, 239]);
  });
});
