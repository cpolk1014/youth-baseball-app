import { describe, expect, it } from "vitest";
import {
  ASK_MAX_QUESTION,
  ASK_MAX_QUESTIONS,
  answerBlocks,
  cleanChat,
  linePieces,
  safeHref,
} from "./chat";

const q = (text: string) => ({ role: "user", text });
const a = (text: string) => ({ role: "assistant", text });

describe("cleanChat", () => {
  it("takes a chat that starts and ends with the visitor", () => {
    expect(cleanChat([q(" What does a club pay? ")])).toEqual({
      ok: true,
      turns: [{ role: "user", text: "What does a club pay?" }],
    });
    expect(cleanChat([q("Hi"), a("Hey!"), q("Pricing?")]).ok).toBe(true);
  });

  it("turns away mixed-up or empty chats", () => {
    expect(cleanChat([]).ok).toBe(false);
    expect(cleanChat("hi").ok).toBe(false);
    expect(cleanChat([a("I'm the assistant")]).ok).toBe(false);
    expect(cleanChat([q("Hi"), a("Hey!")]).ok).toBe(false);
    expect(cleanChat([q("Hi"), q("again")]).ok).toBe(false);
    expect(cleanChat([q("   ")]).ok).toBe(false);
  });

  it("caps question length and chat length", () => {
    expect(cleanChat([q("x".repeat(ASK_MAX_QUESTION + 1))]).ok).toBe(false);
    const long = Array.from({ length: ASK_MAX_QUESTIONS + 1 }, (_, i) => [q(`q${i}`), a(`a${i}`)])
      .flat()
      .slice(0, -1);
    expect(cleanChat(long)).toEqual({
      ok: false,
      error: "This chat is getting long. Start a new one to keep going.",
    });
  });
});

describe("answer formatting", () => {
  it("links only to Fungo's own pages and email", () => {
    expect(safeHref("/demo")).toBe("/demo");
    expect(safeHref("/login?next=/club")).toBe("/login?next=/club");
    expect(safeHref("mailto:Support@fungo.team")).toBe("mailto:support@fungo.team");
    expect(safeHref("https://evil.example")).toBeNull();
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("/games")).toBeNull();
  });

  it("keeps an unsafe link's words as plain text", () => {
    expect(linePieces("See [this](https://evil.example) or [the demo](/demo).")).toEqual([
      { kind: "text", text: "See " },
      { kind: "text", text: "this" },
      { kind: "text", text: " or " },
      { kind: "link", text: "the demo", href: "/demo" },
      { kind: "text", text: "." },
    ]);
  });

  it("makes our email clickable and bold bold", () => {
    expect(linePieces("**Yes.** Email support@fungo.team")).toEqual([
      { kind: "bold", text: "Yes." },
      { kind: "text", text: " Email " },
      { kind: "link", text: "support@fungo.team", href: "mailto:support@fungo.team" },
    ]);
  });

  it("splits paragraphs and bullet lists", () => {
    const blocks = answerBlocks(
      "Two prices:\n- $129 a team\n- $99 a club team\n\nTry the [demo](/demo).",
    );
    expect(blocks.map((b) => [b.kind, b.lines.length])).toEqual([
      ["paragraph", 1],
      ["list", 2],
      ["paragraph", 1],
    ]);
  });
});
