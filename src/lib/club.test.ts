import { describe, expect, it } from "vitest";
import { codeMessage } from "./club";

describe("codeMessage", () => {
  it("gives the coach the code and a link that fills it in", () => {
    const m = codeMessage("Traction Canes", "2026-27", "ABCD2345", "https://www.rallycap.team");
    expect(m).toContain("Traction Canes code for the 2026-27 season: ABCD2345");
    expect(m).toContain("https://www.rallycap.team/members?code=ABCD2345");
    expect(m).toContain("Coaches & parents → Club");
  });
});
