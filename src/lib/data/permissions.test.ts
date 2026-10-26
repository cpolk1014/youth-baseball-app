import { describe, expect, it } from "vitest";
import { bestRole, canCallUp, permissionsFor } from "./permissions";

describe("permissions", () => {
  it("lets coaches do everything", () => {
    expect(permissionsFor("coach")).toEqual({
      editLineups: true,
      editTeam: true,
      manageMembers: true,
    });
  });

  it("lets managers edit the roster and games but not lineups or members", () => {
    expect(permissionsFor("manager")).toEqual({
      editLineups: false,
      editTeam: true,
      manageMembers: false,
    });
  });

  it("makes parents and treasurers read-only", () => {
    for (const role of ["parent", "treasurer"] as const) {
      expect(permissionsFor(role)).toEqual({
        editLineups: false,
        editTeam: false,
        manageMembers: false,
      });
    }
  });

  it("uses a person's strongest role on the team", () => {
    expect(bestRole(["parent", "coach"])).toBe("coach");
    expect(bestRole(["treasurer", "manager"])).toBe("manager");
    expect(bestRole([])).toBe("parent");
  });

  it("makes optioned teams read-only for everyone, but coaches can call up or delete", () => {
    expect(permissionsFor("coach", true)).toEqual({
      editLineups: false,
      editTeam: false,
      manageMembers: false,
    });
    expect(canCallUp("coach")).toBe(true);
    expect(canCallUp("manager")).toBe(false);
    expect(canCallUp("parent")).toBe(false);
  });
});
