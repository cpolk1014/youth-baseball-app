import { describe, expect, it } from "vitest";
import { cleanEvent, guessOurTeam, newTeams, pickDivision, teamKey, tournamentLink } from "./event";

describe("tournamentLink", () => {
  it("keeps https links, adds https:// when left off, and treats blank as none", () => {
    expect(tournamentLink(" https://youth.2dsports.org/public/events/x ")).toBe(
      "https://youth.2dsports.org/public/events/x",
    );
    expect(tournamentLink("youth.2dsports.org/x")).toBe("https://youth.2dsports.org/x");
    expect(tournamentLink("  ")).toBeNull();
  });
  it("refuses links that aren't plain https web links", () => {
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:pw@example.com",
      "https://localhost",
      "not a link at all",
      `https://example.com/${"a".repeat(500)}`,
    ]) {
      expect(tournamentLink(bad)).toBe("bad");
    }
  });
});

describe("cleanEvent", () => {
  it("tidies the details and drops repeats and blanks", () => {
    const e = cleanEvent({
      is_event: true,
      name: "  Caleb   Easterling Memorial ",
      organization: "2D Sports",
      start_date: "2026-10-18",
      end_date: "2026-10-17",
      city: "Baton Rouge, LA",
      venues: ["Burbank Park", "", 3],
      divisions: [
        {
          name: "14u",
          teams: [
            { name: "Tsunami 14u", hometown: "Gonzales, LA", class_label: "14u AA" },
            { name: "tsunami  14U", hometown: null, class_label: null },
            { name: " ", hometown: null, class_label: null },
          ],
        },
        { name: "", teams: [] },
      ],
      warnings: ["Schedule not posted yet"],
    });
    expect(e).toMatchObject({
      isEvent: true,
      name: "Caleb Easterling Memorial",
      startDate: "2026-10-17",
      endDate: "2026-10-18",
      venues: ["Burbank Park"],
      warnings: ["Schedule not posted yet"],
    });
    expect(e.divisions).toEqual([
      {
        name: "14u",
        teams: [{ name: "Tsunami 14u", hometown: "Gonzales, LA", classLabel: "14u AA" }],
      },
    ]);
  });

  it("survives an empty reply", () => {
    expect(cleanEvent(null)).toMatchObject({ isEvent: false, divisions: [], venues: [] });
  });
});

describe("teams", () => {
  const found = [
    { name: "Tsunami 14u", hometown: null, classLabel: null },
    { name: "Reign Baseball", hometown: null, classLabel: null },
    { name: "Reign  baseball!", hometown: null, classLabel: null },
  ];

  it("keeps only teams that aren't listed yet", () => {
    expect(teamKey(" Reign  Baseball! ")).toBe("reign baseball");
    expect(newTeams([{ name: "tsunami 14U" }], found).map((t) => t.name)).toEqual([
      "Reign Baseball",
    ]);
  });

  it("picks the team's age division", () => {
    const divisions = ["8u", "12u", "13u", "14u"].map((name) => ({ name, teams: [] }));
    expect(pickDivision(divisions, "14U")).toBe("14u");
    expect(pickDivision(divisions, "12u")).toBe("12u");
    expect(pickDivision(divisions, "10U")).toBeNull();
    expect(pickDivision(divisions, null)).toBeNull();
  });

  it("guesses which listed team is ours", () => {
    expect(guessOurTeam(found, "Tsunami")).toBe("Tsunami 14u");
    expect(guessOurTeam(found, "Riverside Rattlers 14U")).toBeNull();
  });
});
