import { describe, expect, it } from "vitest";
import type { Guardian, Member } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";
import {
  authorOf,
  canEdit,
  canModerate,
  canRemove,
  dayLabel,
  feedItems,
  mergePosts,
  checkPoll,
  myReactions,
  nextVote,
  oneEmoji,
  reactionsFrom,
  reactorNames,
  toggleReaction,
  photoPaths,
  pollOpen,
  pollStatus,
  tally,
  type ChatterPoll,
  pinnedPost,
  postFromRow,
  previewText,
  snippet,
  type ChatterPost,
} from "./feed";

const member = (userId: string, role: Member["role"], displayName: string | null): Member => ({
  id: `m-${userId}`,
  userId,
  role,
  displayName,
});
const player = (id: string, name: string) => ({ id, name }) as Player;
const guardian = (userId: string, playerId: string): Guardian => ({
  id: `g-${userId}-${playerId}`,
  userId,
  playerId,
});

const team = {
  members: [
    member("u-coach", "owner", "Mike Hill"),
    member("u-mom", "parent", "Dana Reyes"),
    member("u-dad", "parent", null),
    member("u-mgr", "manager", "Pat"),
  ],
  guardians: [guardian("u-mom", "p1"), guardian("u-mom", "p2")],
  players: [player("p1", "Mason Reyes"), player("p2", "Ella Reyes")],
};

const post = (over: Partial<ChatterPost>): ChatterPost => ({
  id: "x",
  teamId: "t",
  authorId: "u-mom",
  body: "Hi",
  quotePostId: null,
  kind: "post",
  photos: [],
  reactions: [],
  createdAt: "2026-11-20T18:00:00.000Z",
  editedAt: null,
  pinnedAt: null,
  removedAt: null,
  ...over,
});

describe("authorOf", () => {
  it("names a coach", () => {
    expect(authorOf("u-coach", team)).toEqual({ name: "Mike Hill", role: "Coach", staff: true });
  });
  it("names a parent by their kids", () => {
    expect(authorOf("u-mom", team)).toEqual({
      name: "Dana Reyes",
      role: "Mason & Ella's family",
      staff: false,
    });
  });
  it("falls back when a parent has no name or kids linked", () => {
    expect(authorOf("u-dad", team)).toEqual({ name: "Parent", role: "Parent", staff: false });
  });
  it("calls someone who left a former member", () => {
    expect(authorOf("u-gone", team).name).toBe("Former member");
    expect(authorOf(null, team).role).toBeNull();
  });
});

describe("permissions", () => {
  const now = new Date("2026-11-20T18:05:00.000Z");
  it("lets the author edit for 10 minutes", () => {
    expect(canEdit(post({}), "u-mom", now)).toBe(true);
    expect(canEdit(post({}), "u-mom", new Date("2026-11-20T18:10:01.000Z"))).toBe(false);
    expect(canEdit(post({}), "u-coach", now)).toBe(false);
    expect(canEdit(post({ removedAt: now.toISOString() }), "u-mom", now)).toBe(false);
  });
  it("lets authors and coaches or managers remove", () => {
    expect(canRemove(post({}), "u-mom", "parent")).toBe(true);
    expect(canRemove(post({}), "u-dad", "parent")).toBe(false);
    expect(canRemove(post({}), "u-mgr", "manager")).toBe(true);
    expect(canRemove(post({}), "u-t", "treasurer")).toBe(false);
    expect(canModerate("coach")).toBe(true);
    expect(canModerate("treasurer")).toBe(false);
  });
});

describe("the feed", () => {
  it("merges live updates in order without duplicates", () => {
    const a = post({ id: "a", createdAt: "2026-11-20T18:00:00Z" });
    const b = post({ id: "b", createdAt: "2026-11-20T18:01:00Z" });
    const merged = mergePosts([b], [a, { ...b, body: "edited" }]);
    expect(merged.map((p) => p.id)).toEqual(["a", "b"]);
    expect(merged[1]!.body).toBe("edited");
  });

  it("finds the pinned post", () => {
    expect(
      pinnedPost([
        post({ id: "a", pinnedAt: "2026-11-20T10:00:00Z" }),
        post({ id: "b", pinnedAt: "2026-11-20T11:00:00Z", removedAt: "2026-11-20T12:00:00Z" }),
      ])?.id,
    ).toBe("a");
    expect(pinnedPost([post({})])).toBeNull();
  });

  it("labels days", () => {
    const now = new Date(2026, 10, 20, 12);
    expect(dayLabel(new Date(2026, 10, 20, 8).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 19, 23).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 17, 9).toISOString(), now)).toBe("Tuesday");
    expect(dayLabel(new Date(2026, 10, 2, 9).toISOString(), now)).toBe("Mon, Nov 2");
    expect(dayLabel(new Date(2025, 10, 2, 9).toISOString(), now)).toBe("Sun, Nov 2, 2025");
  });

  it("marks new days and groups quick posts by the same person", () => {
    const now = new Date(2026, 10, 20, 12);
    const at = (h: number, m: number, d = 20) => new Date(2026, 10, d, h, m).toISOString();
    const items = feedItems(
      [
        post({ id: "1", createdAt: at(9, 0, 19) }),
        post({ id: "2", createdAt: at(9, 0) }),
        post({ id: "3", createdAt: at(9, 2) }),
        post({ id: "4", createdAt: at(9, 3), quotePostId: "1" }),
        post({ id: "5", createdAt: at(9, 30) }),
        post({ id: "6", createdAt: at(9, 31), authorId: "u-coach" }),
      ],
      now,
    );
    expect(items.map((i) => i.day)).toEqual(["Yesterday", "Today", null, null, null, null]);
    expect(items.map((i) => i.grouped)).toEqual([false, false, true, false, false, false]);
  });

  it("shortens a quoted post", () => {
    expect(snippet("Practice\n\nmoved   to 6")).toBe("Practice moved to 6");
    expect(snippet("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });
});

describe("photos", () => {
  const photo = { path: "t/u/a.jpg", thumb: "t/u/a-t.jpg", w: 1600, h: 1200 };
  it("reads photos from a row and skips anything odd", () => {
    const row = {
      id: "a",
      team_id: "t",
      author_id: "u",
      body: "",
      quote_post_id: null,
      photos: [photo, { path: 3 }, null, { path: "x", thumb: "y" }],
      created_at: "2026-11-20T18:00:00Z",
      edited_at: null,
      pinned_at: null,
      removed_at: null,
    };
    expect(postFromRow(row).photos).toEqual([photo, { path: "x", thumb: "y", w: 0, h: 0 }]);
    expect(postFromRow({ ...row, photos: undefined }).photos).toEqual([]);
  });
  it("describes photo posts in one line", () => {
    expect(previewText({ body: "", photos: [photo] })).toBe("📷 Photo");
    expect(previewText({ body: "Great game!", photos: [photo, photo] })).toBe(
      "📷 2 photos · Great game!",
    );
    expect(previewText({ body: "Hi", photos: [] })).toBe("Hi");
  });
  it("puts photos in the poster's own folder", () => {
    expect(photoPaths("team", "me", "x")).toEqual({
      path: "team/me/x.jpg",
      thumb: "team/me/x-t.jpg",
    });
  });
});

describe("polls", () => {
  const poll = (over: Partial<ChatterPoll> = {}): ChatterPoll => ({
    postId: "p",
    options: ["Pizza", "Tacos", "Burgers"],
    multi: false,
    anonymous: false,
    closesAt: null,
    closedAt: null,
    version: 0,
    ...over,
  });

  it("knows when a poll is open", () => {
    const now = new Date("2026-11-20T18:00:00Z");
    expect(pollOpen(poll(), now)).toBe(true);
    expect(pollOpen(poll({ closesAt: "2026-11-20T17:59:00Z" }), now)).toBe(false);
    expect(pollOpen(poll({ closedAt: "2026-11-20T10:00:00Z" }), now)).toBe(false);
    expect(pollStatus(poll({ closedAt: "2026-11-20T10:00:00Z" }), now)).toBe("Closed");
    expect(pollStatus(poll(), now)).toBe("");
  });

  it("tallies shares, my vote, ties and people", () => {
    const t = tally(poll(), [
      { votes: 2, mine: true, voters: ["a", "b"] },
      { votes: 2, mine: false, voters: ["c", "d"] },
      { votes: 0, mine: false, voters: [] },
    ]);
    expect(t.votes).toBe(4);
    expect(t.voters).toBe(4);
    expect(t.choices.map((c) => c.share)).toEqual([0.5, 0.5, 0]);
    expect(t.choices.map((c) => c.leading)).toEqual([true, true, false]);
    expect(t.choices[0]!.mine).toBe(true);
  });

  it("counts a person once on multi-choice polls", () => {
    const t = tally(poll({ multi: true }), [
      { votes: 2, mine: true, voters: ["a", "b"] },
      { votes: 1, mine: false, voters: ["a"] },
    ]);
    expect(t.voters).toBe(2);
    expect(t.votes).toBe(3);
  });

  it("shows an empty poll before results load", () => {
    const t = tally(poll(), undefined);
    expect(t.votes).toBe(0);
    expect(t.choices.every((c) => !c.leading)).toBe(true);
  });

  it("switches, takes back and toggles votes", () => {
    expect(nextVote(poll(), [], 1)).toEqual([1]);
    expect(nextVote(poll(), [1], 2)).toEqual([2]);
    expect(nextVote(poll(), [2], 2)).toEqual([]);
    expect(nextVote(poll({ multi: true }), [2], 0)).toEqual([0, 2]);
    expect(nextVote(poll({ multi: true }), [0, 2], 2)).toEqual([0]);
  });

  it("checks a new poll", () => {
    expect(checkPoll("", ["a", "b"])).toBe("Ask a question first.");
    expect(checkPoll("Q?", ["a", " "])).toBe("A poll needs at least 2 choices.");
    expect(checkPoll("Q?", ["Yes", "yes "])).toBe("Two of the choices are the same.");
    expect(checkPoll("Q?", ["Yes", "No", ""])).toBeNull();
  });

  it("previews a poll in one line", () => {
    expect(previewText({ body: "Pizza or tacos?", photos: [], kind: "poll" })).toBe(
      "📊 Poll: Pizza or tacos?",
    );
  });
});

describe("reactions", () => {
  it("reads reactions from a row and skips anything odd", () => {
    expect(
      reactionsFrom([{ e: "👍", u: ["a", "b"] }, { e: "🔥", u: [] }, { e: 3, u: ["a"] }, null]),
    ).toEqual([{ emoji: "👍", userIds: ["a", "b"] }]);
    expect(reactionsFrom(undefined)).toEqual([]);
  });

  it("toggles my emoji on and off", () => {
    const start = [{ emoji: "👍", userIds: ["a"] }];
    const on = toggleReaction(start, "👍", "me");
    expect(on).toEqual([{ emoji: "👍", userIds: ["a", "me"] }]);
    expect(toggleReaction(on, "👍", "me")).toEqual(start);
    expect(toggleReaction(start, "🔥", "me")).toEqual([...start, { emoji: "🔥", userIds: ["me"] }]);
    expect(toggleReaction([{ emoji: "🔥", userIds: ["me"] }], "🔥", "me")).toEqual([]);
  });

  it("stops at 3 emoji per person", () => {
    let r = toggleReaction([], "👍", "me");
    r = toggleReaction(r, "🔥", "me");
    r = toggleReaction(r, "⚾", "me");
    expect(toggleReaction(r, "🎉", "me")).toBe(r);
    expect(myReactions(r, "me")).toEqual(["👍", "🔥", "⚾"]);
  });

  it("takes exactly one emoji", () => {
    expect(oneEmoji(" 🎉 ")).toBe("🎉");
    expect(oneEmoji("❤️")).toBe("❤️");
    expect(oneEmoji("👨‍👩‍👧")).toBe("👨‍👩‍👧");
    expect(oneEmoji("🇺🇸")).toBe("🇺🇸");
    expect(oneEmoji("1️⃣")).toBe("1️⃣");
    expect(oneEmoji("👍🏽")).toBe("👍🏽");
    expect(oneEmoji("🎉🎉")).toBeNull();
    expect(oneEmoji("lol")).toBeNull();
    expect(oneEmoji("7")).toBeNull();
    expect(oneEmoji("")).toBeNull();
  });

  it("names who reacted", () => {
    const name = (id: string) => ({ a: "Dana", b: "Pat", c: "Mike", d: "Sam" })[id] ?? "?";
    expect(reactorNames(["a"], "me", name)).toBe("Dana");
    expect(reactorNames(["a", "me"], "me", name)).toBe("You and Dana");
    expect(reactorNames(["a", "b", "c"], "me", name)).toBe("Dana, Pat and Mike");
    expect(reactorNames(["a", "b", "c", "d", "me"], "me", name)).toBe("You, Dana and 3 others");
  });
});
