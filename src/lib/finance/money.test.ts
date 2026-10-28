import { describe, expect, it } from "vitest";
import { formatCents, installmentDates, parseCents, splitCents } from "./money";

describe("money", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(112795)).toBe("$1,127.95");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-19777)).toBe("-$197.77");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("parses what people type", () => {
    expect(parseCents("1,127.95")).toBe(112795);
    expect(parseCents("$100")).toBe(10000);
    expect(parseCents("40.5")).toBe(4050);
    expect(parseCents(" 8032 ")).toBe(803200);
    expect(parseCents(".5")).toBe(50);
    expect(parseCents("12.345")).toBeNull();
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("")).toBeNull();
    expect(parseCents("-5")).toBeNull();
  });

  it("splits cents exactly, extra pennies last", () => {
    expect(splitCents(112795, 4)).toEqual([28198, 28199, 28199, 28199]);
    expect(splitCents(110000, 11)).toEqual(Array(11).fill(10000));
    const shares = splitCents(803200, 11);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(803200);
    expect(new Set(shares)).toEqual(new Set([73018, 73019]));
    expect(splitCents(100, 0)).toEqual([]);
  });

  it("schedules monthly installments from a first due date", () => {
    expect(installmentDates("2027-01-15", 4, "month")).toEqual([
      "2027-01-15",
      "2027-02-15",
      "2027-03-15",
      "2027-04-15",
    ]);
    expect(installmentDates("2027-01-31", 4, "month")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expect(installmentDates("2026-11-15", 3, "month")).toEqual([
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
    ]);
  });

  it("schedules weekly and every-two-weeks installments", () => {
    expect(installmentDates("2027-02-25", 2, "week")).toEqual(["2027-02-25", "2027-03-04"]);
    expect(installmentDates("2027-01-01", 3, "2weeks")).toEqual([
      "2027-01-01",
      "2027-01-15",
      "2027-01-29",
    ]);
    expect(installmentDates("2027-01-01", 0, "month")).toEqual([]);
  });
});
