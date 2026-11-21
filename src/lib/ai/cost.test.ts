import { describe, expect, it } from "vitest";
import { claudeCents, elevenCents } from "./cost";

describe("AI cost", () => {
  it("prices Claude calls by model", () => {
    // 4,500 in and 2,000 out on Opus: $0.018 + $0.04 = 5.8¢.
    expect(claudeCents("claude-opus-5-5", { input_tokens: 4500, output_tokens: 2000 })).toBe(5.8);
    expect(claudeCents("claude-sonnet-5-5", { input_tokens: 4500, output_tokens: 2000 })).toBe(2.9);
    expect(claudeCents("claude-haiku-5-5", { input_tokens: 1000, output_tokens: 600 })).toBe(0.04);
  });
  it("counts cache tokens and treats unknown models like Opus", () => {
    expect(
      claudeCents("something-new", {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBe(540);
    expect(claudeCents("claude-opus-5-5", null)).toBe(0);
  });
  it("prices ElevenLabs clips", () => {
    expect(elevenCents.song(18)).toBe(4.5);
    expect(elevenCents.speech(200)).toBe(1.6);
  });
});
