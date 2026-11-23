import { describe, expect, it } from "vitest";
import { demoPhotoUrl, isGuest } from "./guest";

describe("isGuest", () => {
  it("is true only for an anonymous sign-in", () => {
    expect(isGuest({ is_anonymous: true })).toBe(true);
    expect(isGuest({ is_anonymous: false })).toBe(false);
    expect(isGuest({})).toBe(false);
    expect(isGuest(null)).toBe(false);
  });
});

describe("demoPhotoUrl", () => {
  it("serves demo pictures from the app's own files", () => {
    expect(demoPhotoUrl("demo/scoreboard.jpg")).toBe("/demo-chatter/scoreboard.jpg");
    expect(demoPhotoUrl("demo/scoreboard-thumb.jpg")).toBe("/demo-chatter/scoreboard-thumb.jpg");
  });
  it("leaves real photos to the private bucket", () => {
    expect(demoPhotoUrl("team-id/user-id/photo.jpg")).toBeNull();
    expect(demoPhotoUrl("demo/../secret.jpg")).toBeNull();
    expect(demoPhotoUrl("x/demo/a.jpg")).toBeNull();
  });
});
