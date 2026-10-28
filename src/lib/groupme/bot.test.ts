import { describe, expect, it } from "vitest";
import { groupMeBot, isBotId } from "./bot";
import { ChannelError } from "./channel";

const fakeFetch = (status: number, calls: unknown[] = []) =>
  (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response(null, { status });
  }) as unknown as typeof fetch;

describe("GroupMe bot", () => {
  it("posts each part of a long message, in order", async () => {
    const calls: { bot_id: string; text: string }[] = [];
    const text = Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(40)}`).join("\n");
    await groupMeBot("abc123def456", fakeFetch(202, calls)).post(text);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.bot_id === "abc123def456" && c.text.length <= 1000)).toBe(true);
    expect(calls.map((c) => c.text).join("\n")).toBe(text);
  });

  it("explains a bad bot ID and other failures", async () => {
    await expect(groupMeBot("abc123def456", fakeFetch(404)).post("hi")).rejects.toThrow(/Bot ID/);
    await expect(groupMeBot("abc123def456", fakeFetch(500)).post("hi")).rejects.toBeInstanceOf(
      ChannelError,
    );
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(groupMeBot("abc123def456", offline).post("hi")).rejects.toThrow(/reach GroupMe/);
  });

  it("checks what a bot ID looks like", () => {
    expect(isBotId("abcdef0123456789abcdef0123")).toBe(true);
    expect(isBotId("not a bot id")).toBe(false);
    expect(isBotId("short")).toBe(false);
  });
});
