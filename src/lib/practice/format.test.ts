import { describe, expect, it } from "vitest";
import { formatPracticeWhen } from "./format";

describe("formatPracticeWhen", () => {
  it("shows day and a compact time range", () => {
    expect(formatPracticeWhen({ date: "2026-11-03", startTime: "18:00", endTime: "19:30" })).toBe(
      "Tue, Nov 3 · 6–7:30 PM",
    );
    expect(formatPracticeWhen({ date: "2026-11-03", startTime: "11:30", endTime: "13:00" })).toBe(
      "Tue, Nov 3 · 11:30 AM–1 PM",
    );
    expect(formatPracticeWhen({ date: "2026-11-03", startTime: "18:00", endTime: null })).toBe(
      "Tue, Nov 3 · 6 PM",
    );
    expect(formatPracticeWhen({ date: "2026-11-03", startTime: null, endTime: null })).toBe(
      "Tue, Nov 3",
    );
  });
});
