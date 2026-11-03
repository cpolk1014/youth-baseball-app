import { describe, expect, it } from "vitest";
import { cleanVenmo, venmoPayUrl } from "./handle";

describe("cleanVenmo", () => {
  it("takes @handles, plain handles and Venmo links", () => {
    expect(cleanVenmo("@Polk-Family")).toBe("Polk-Family");
    expect(cleanVenmo("  Craig_Polk ")).toBe("Craig_Polk");
    expect(cleanVenmo("https://venmo.com/u/Polk-Family")).toBe("Polk-Family");
    expect(cleanVenmo("venmo.com/Polk-Family?txn=pay".replace(/^/, "https://"))).toBe(
      "Polk-Family",
    );
  });

  it("refuses things that can't be a Venmo username", () => {
    expect(cleanVenmo("abc")).toBeNull();
    expect(cleanVenmo("has space")).toBeNull();
    expect(cleanVenmo("a".repeat(31))).toBeNull();
    expect(cleanVenmo("")).toBeNull();
  });

  it("links to the person's Venmo", () => {
    expect(venmoPayUrl("Polk-Family")).toBe("https://venmo.com/u/Polk-Family");
  });
});
