import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/data/seed";
import type { AppData } from "@/lib/data/types";
import type { MemberRole } from "@/lib/data/permissions";
import { GAME_DAY, visibleTabs } from "./nav";

const as = (role: MemberRole, tournamentCount = 0): AppData => ({
  ...SEED_DATA,
  me: { ...SEED_DATA.me, role },
  tournamentCount,
});
const showsTournaments = (data: AppData) =>
  visibleTabs(GAME_DAY, data).some((t) => t.id === "tournaments");

describe("Tournaments in the menu", () => {
  it("shows for coaches, owners and managers before the first tournament", () => {
    expect(showsTournaments(as("coach"))).toBe(true);
    expect(showsTournaments(as("owner"))).toBe(true);
    expect(showsTournaments(as("manager"))).toBe(true);
  });

  it("waits for a tournament for parents and treasurers", () => {
    expect(showsTournaments(as("parent"))).toBe(false);
    expect(showsTournaments(as("treasurer"))).toBe(false);
    expect(showsTournaments(as("parent", 1))).toBe(true);
  });
});
