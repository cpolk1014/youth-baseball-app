import { describe, expect, it } from "vitest";
import {
  cleanEvent,
  eventPages,
  guessOurTeam,
  htmlToText,
  isPrivateAddress,
  newTeams,
  pickDivision,
  safeEventUrl,
  teamKey,
} from "./event";

describe("htmlToText", () => {
  it("keeps the readable text, one line per block, without scripts or styles", () => {
    const text = htmlToText(
      `<html><head><style>.x{color:red}</style><script>var a = "<p>no</p>";</script></head>
       <body><h1>Caleb Easterling&nbsp;Memorial</h1><div class="panel-heading"><a href="/t/1">Tsunami 14u</a>
       <span>Gonzales, LA</span> | (14u AA )</div><p>Tom &amp; Jerry&#39;s</p><!-- hidden --></body></html>`,
    );
    expect(text).toBe(
      "Caleb Easterling Memorial\nTsunami 14u Gonzales, LA | (14u AA )\nTom & Jerry's",
    );
  });
});

describe("safeEventUrl", () => {
  it("accepts public https links and drops the #fragment", () => {
    expect(safeEventUrl("https://youth.2dsports.org/events/x/teams#top")?.toString()).toBe(
      "https://youth.2dsports.org/events/x/teams",
    );
  });

  it("refuses links it shouldn't fetch", () => {
    for (const bad of [
      "http://youth.2dsports.org/events/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.10/x",
      "https://intranet/x",
      "https://user:pw@example.com/x",
      "https://example.com:8443/x",
      "https://[::1]/x",
      "ftp://example.com",
      "not a link",
    ]) {
      expect(safeEventUrl(bad), bad).toBeNull();
    }
  });
});

describe("isPrivateAddress", () => {
  it("spots private and local addresses", () => {
    for (const ip of [
      "10.1.2.3",
      "127.0.0.1",
      "192.168.0.1",
      "172.20.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("104.21.3.4")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("eventPages", () => {
  it("reads the event and its /teams page, or just the teams page if that's the link", () => {
    expect(eventPages(new URL("https://a.org/events/x/"))).toEqual([
      "https://a.org/events/x",
      "https://a.org/events/x/teams",
    ]);
    expect(eventPages(new URL("https://a.org/events/x/teams"))).toEqual([
      "https://a.org/events/x/teams",
    ]);
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
