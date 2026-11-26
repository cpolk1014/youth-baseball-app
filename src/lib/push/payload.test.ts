import { describe, expect, it } from "vitest";
import {
  boxScoreLine,
  boxScorePush,
  chargesPush,
  channelPush,
  chatterPush,
  coachPush,
  dayText,
  gamesPush,
  inningsText,
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

describe("box score notices", () => {
  const line = (
    batting: Record<string, number>,
    pitching: Record<string, number> | null = null,
  ) => ({
    change: "boxscore" as const,
    ref: "g1",
    player_id: "p1",
    player: "Mason",
    date: "2026-11-21",
    opponent: "Cubs",
    batting,
    pitching,
    unlocked: true,
  });

  it("says how the kid did at the plate", () => {
    expect(boxScoreLine(line({ ab: 3, h: 2, doubles: 1, rbi: 2 }))).toBe(
      "Mason went 2 for 3 with a double and 2 RBI vs Cubs.",
    );
    expect(boxScoreLine(line({ ab: 4, h: 0 }))).toBe("Mason went 0 for 4 vs Cubs.");
    expect(boxScoreLine(line({ ab: 3, h: 3, hr: 1, triples: 1, doubles: 1, rbi: 4 }))).toBe(
      "Mason went 3 for 3 with a homer, a triple and a double vs Cubs.",
    );
    expect(boxScoreLine(line({ ab: 0, bb: 2 }))).toBe("Mason drew 2 walks vs Cubs.");
  });

  it("says how the kid pitched", () => {
    expect(boxScoreLine(line({ ab: 2, h: 1 }, { outs: 6, pitches: 34, so: 5 }))).toBe(
      "Mason went 1 for 2 and pitched 2 innings (34 pitches, 5 strikeouts) vs Cubs.",
    );
    expect(boxScoreLine(line({}, { outs: 4, pitches: 22, so: 1 }))).toBe(
      "Mason pitched 1⅓ innings (22 pitches, 1 strikeout) vs Cubs.",
    );
    expect(boxScoreLine(line({}, { pitches: 41 }))).toBe("Mason threw 41 pitches vs Cubs.");
    expect(inningsText(2)).toBe("⅔ of an inning");
    expect(inningsText(3)).toBe("1 inning");
  });

  it("still says something with an empty line, and skips a missing opponent", () => {
    expect(boxScoreLine({ ...line({}), opponent: "x" })).toBe("Mason's line is in.");
  });

  it("shows the line to parents with a pass and opens the kid's page", () => {
    const p = boxScorePush("t1", "Bayou Bombers 10U", [line({ ab: 3, h: 2, doubles: 1 })]);
    expect(p).toEqual({
      title: "Bayou Bombers 10U",
      body: "Mason went 2 for 3 with a double vs Cubs.",
      url: "/my-player?player=p1",
      tag: "stats-t1",
    });
  });

  it("only teases without a pass: no numbers", () => {
    const p = boxScorePush("t1", "Bombers", [{ ...line({ ab: 3, h: 2 }), unlocked: false }]);
    expect(p.body).toBe("The box score from Sat vs Cubs is in. See how Mason did.");
    expect(p.body).not.toMatch(/\d for \d/);
  });

  it("puts brothers and sisters in one notice", () => {
    const ella = { ...line({ ab: 2, h: 1 }), player_id: "p2", player: "Ella" };
    const p = boxScorePush("t1", "Bombers", [line({ ab: 3, h: 2 }), ella]);
    expect(p.body).toBe("Mason went 2 for 3 vs Cubs. Ella went 1 for 2 vs Cubs.");
    expect(p.url).toBe("/my-player");
    const both = boxScorePush("t1", "Bombers", [
      { ...line({}), unlocked: false },
      { ...ella, unlocked: false },
    ]);
    expect(both.body).toBe("The box score from Sat vs Cubs is in. See how Mason and Ella did.");
  });
});

describe("channel posts", () => {
  const post = { body: "Who's bringing the cooler?" };
  it("names the channel in the title and opens that tab", () => {
    const p = channelPush({
      teamId: "t1",
      teamName: "10U Canes",
      channel: "families",
      from: "Dana",
      post,
    });
    expect(p.title).toBe("10U Canes · Parents");
    expect(p.body).toBe("Dana: Who's bringing the cooler?");
    expect(p.url).toBe("/chatter?team=t1&channel=families");
    expect(p.tag).toBe("chatter-t1-families");
  });
  it("calls the stored channels by their names", () => {
    const at = (channel: string) =>
      channelPush({ teamId: "t1", teamName: "10U Canes", channel, from: "Fungo", post });
    expect(at("parents").title).toBe("10U Canes · Team");
    expect(at("parents").url).toBe("/chatter?team=t1&channel=parents");
    expect(at("team").title).toBe("10U Canes · Club");
    expect(at("team").tag).toBe("chatter-t1-team");
    // Anything else is the team's own channel.
    expect(at("nope").title).toBe("10U Canes · Team");
  });
  it("keeps each channel's notification apart", () => {
    const tags = ["parents", "team", "families"].map(
      (channel) => channelPush({ teamId: "t1", teamName: "X", channel, from: "A", post }).tag,
    );
    expect(new Set(tags).size).toBe(3);
  });
});
