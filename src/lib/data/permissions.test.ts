import { describe, expect, it } from "vitest";
import { bestRole, canDeleteTeam, permissionsFor } from "./permissions";

describe("permissions", () => {
  it("lets coaches do everything", () => {
    expect(permissionsFor("coach")).toEqual({
      editLineups: true,
      editTeam: true,
      manageMembers: true,
      editMoney: true,
      seeAllMoney: true,
    });
  });

  it("lets managers edit the roster and games but not lineups or members", () => {
    expect(permissionsFor("manager")).toEqual({
      editLineups: false,
      editTeam: true,
      manageMembers: false,
      editMoney: false,
      seeAllMoney: false,
    });
  });

  it("makes parents read-only", () => {
    expect(permissionsFor("parent")).toEqual({
      editLineups: false,
      editTeam: false,
      manageMembers: false,
      editMoney: false,
      seeAllMoney: false,
    });
  });

  it("lets treasurers manage money and nothing else", () => {
    expect(permissionsFor("treasurer")).toEqual({
      editLineups: false,
      editTeam: false,
      manageMembers: false,
      editMoney: true,
      seeAllMoney: true,
    });
  });

  it("uses a person's strongest role on the team", () => {
    expect(bestRole(["parent", "coach"])).toBe("coach");
    expect(bestRole(["treasurer", "manager"])).toBe("manager");
    expect(bestRole([])).toBe("parent");
  });

  it("lets only coaches and the owner delete a team", () => {
    expect(canDeleteTeam("owner")).toBe(true);
    expect(canDeleteTeam("coach")).toBe(true);
    expect(canDeleteTeam("manager")).toBe(false);
    expect(canDeleteTeam("treasurer")).toBe(false);
    expect(canDeleteTeam("parent")).toBe(false);
  });

  it("lets the owner do everything a coach can, and outranks every role", () => {
    expect(permissionsFor("owner")).toEqual(permissionsFor("coach"));
    expect(bestRole(["coach", "owner", "parent"])).toBe("owner");
  });
});
