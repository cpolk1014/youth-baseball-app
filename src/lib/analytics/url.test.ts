import { describe, expect, it } from "vitest";
import { analyticsUrl } from "./url";

describe("analyticsUrl", () => {
  it("keeps public pages as they are", () => {
    expect(analyticsUrl("https://www.fungo.team/pricing")).toBe("https://www.fungo.team/pricing");
    expect(analyticsUrl("https://www.fungo.team/")).toBe("https://www.fungo.team/");
  });

  it("drops the query and hash (sign-in codes, club codes, next=…)", () => {
    expect(analyticsUrl("https://www.fungo.team/members?code=ABCD2345#plan")).toBe(
      "https://www.fungo.team/members",
    );
  });

  it("hides invite links and shared tournament tokens", () => {
    expect(analyticsUrl("https://www.fungo.team/join/s3cr3tInviteToken")).toBe(
      "https://www.fungo.team/join/[token]",
    );
    expect(analyticsUrl("https://www.fungo.team/t/8c4f2bc82f6e4da0bd75")).toBe(
      "https://www.fungo.team/t/[token]",
    );
  });

  it("groups pages by kind instead of sending record ids", () => {
    expect(analyticsUrl("https://www.fungo.team/games/b5ddbdc5-2a34-4f8d-a281-a97c6e594ba3")).toBe(
      "https://www.fungo.team/games/[id]",
    );
    expect(
      analyticsUrl(
        "https://www.fungo.team/tournaments/b5ddbdc5-2a34-4f8d-a281-a97c6e594ba3/bracket",
      ),
    ).toBe("https://www.fungo.team/tournaments/[id]/bracket");
  });
});
