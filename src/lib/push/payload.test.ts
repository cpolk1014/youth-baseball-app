import { describe, expect, it } from "vitest";
import { chatterPush, coachPush, keyBytes, postLine } from "./payload";

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
