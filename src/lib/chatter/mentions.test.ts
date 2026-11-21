import { describe, expect, it } from "vitest";
import {
  filterMentionables,
  insertMention,
  mentionQuery,
  mentionsIn,
  splitMentions,
} from "./mentions";

const people = [
  { id: "u1", label: "Dana Reyes", hint: "Mason's family" },
  { id: "u2", label: "Mike Hill", hint: "Coach" },
  { id: "coaches", label: "coaches" },
];

describe("tags", () => {
  it("finds the @word being typed", () => {
    expect(mentionQuery("Hi @da", 6)).toEqual({ start: 3, query: "da" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("email me@x.com", 14)).toBeNull();
    expect(mentionQuery("Hi @da and", 10)).toBeNull();
  });

  it("suggests names that start with what's typed first", () => {
    expect(filterMentionables(people, "re").map((p) => p.id)).toEqual(["u1"]);
    expect(filterMentionables(people, "co").map((p) => p.id)).toEqual(["coaches"]);
    expect(filterMentionables(people, "")).toHaveLength(3);
  });

  it("puts the name in place of what was typed", () => {
    expect(insertMention("Hi @da thanks", { start: 3, query: "da" }, "Dana Reyes")).toEqual({
      text: "Hi @Dana Reyes thanks",
      caret: 15,
    });
  });

  it("keeps only tags still in the words", () => {
    expect(mentionsIn("Thanks @Dana Reyes!", people)).toEqual(["u1"]);
    expect(mentionsIn("Thanks Dana", people)).toEqual([]);
  });

  it("splits a post around its tags", () => {
    expect(
      splitMentions("Thanks @Dana Reyes and @coaches!", [
        { id: "u1", label: "Dana Reyes" },
        { id: "coaches", label: "coaches" },
      ]),
    ).toEqual([
      { text: "Thanks " },
      { text: "@Dana Reyes", tag: "u1" },
      { text: " and " },
      { text: "@coaches", tag: "coaches" },
      { text: "!" },
    ]);
    expect(splitMentions("No tags", [])).toEqual([{ text: "No tags" }]);
  });
});
