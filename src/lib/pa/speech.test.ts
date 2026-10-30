import { describe, expect, it } from "vitest";
import { announcement, numberWords, scriptProblem, spokenName, spokenNumber } from "./speech";

describe("numberWords", () => {
  it("says jersey numbers like an announcer", () => {
    expect(numberWords(0)).toBe("zero");
    expect(numberWords(7)).toBe("seven");
    expect(numberWords(13)).toBe("thirteen");
    expect(numberWords(20)).toBe("twenty");
    expect(numberWords(24)).toBe("twenty-four");
    expect(numberWords(67)).toBe("sixty-seven");
    expect(numberWords(99)).toBe("ninety-nine");
    expect(numberWords(100)).toBe("one zero zero");
  });
});

describe("announcement", () => {
  it("fills in the default script", () => {
    expect(announcement({ rosterName: "Jake P.", jerseyNumber: 24 })).toBe(
      "Now batting... number twenty-four... Jake P.!",
    );
  });

  it("uses how the family says the name and number (6-7, not sixty-seven)", () => {
    const call = {
      rosterName: "Jake P.",
      jerseyNumber: 67,
      nameSpoken: "Jake Pohlk",
      numberSpoken: "six seven",
    };
    expect(spokenName(call)).toBe("Jake Pohlk");
    expect(spokenNumber(call)).toBe("six seven");
    expect(announcement(call)).toBe("Now batting... number six seven... Jake Pohlk!");
  });

  it("skips the number when there isn't one", () => {
    expect(announcement({ rosterName: "Eli M." })).toBe("Now batting... Eli M.!");
  });

  it("takes a custom script", () => {
    expect(
      announcement({
        rosterName: "Jake",
        jerseyNumber: 5,
        script: "Here comes {name}, wearing {number}!",
      }),
    ).toBe("Here comes Jake, wearing five!");
  });
});

describe("scriptProblem", () => {
  it("needs {name} and a sane length", () => {
    expect(scriptProblem("")).toBeNull();
    expect(scriptProblem("Here comes {name}")).toBeNull();
    expect(scriptProblem("Here comes the kid")).toMatch(/\{name\}/);
    expect(scriptProblem("{name} " + "x".repeat(200))).toMatch(/under/);
  });
});
