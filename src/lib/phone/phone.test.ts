import { describe, expect, it } from "vitest";
import { cleanPhone, formatPhone, telUrl } from "./phone";

describe("phone numbers", () => {
  it("cleans what people type to one stored form", () => {
    expect(cleanPhone("(337) 555-0123")).toBe("+13375550123");
    expect(cleanPhone("337.555.0123")).toBe("+13375550123");
    expect(cleanPhone("1-337-555-0123")).toBe("+13375550123");
    expect(cleanPhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("refuses things that can't be a number", () => {
    expect(cleanPhone("")).toBeNull();
    expect(cleanPhone("555-0123")).toBeNull();
    expect(cleanPhone("call me")).toBeNull();
    expect(cleanPhone("+1234")).toBeNull();
  });

  it("shows US numbers the usual way and dials with tel:", () => {
    expect(formatPhone("+13375550123")).toBe("(337) 555-0123");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
    expect(telUrl("+13375550123")).toBe("tel:+13375550123");
  });
});
