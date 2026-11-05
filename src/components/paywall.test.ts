import { describe, expect, it } from "vitest";
import type { TeamPlan } from "@/lib/data/types";
import { planLine, renewReminder } from "./paywall";

const plan = (over: Partial<TeamPlan>): TeamPlan => ({
  paid: true,
  kind: "pass",
  until: "2027-07-31",
  ends: "2027-07-31",
  nextSeason: false,
  ...over,
});
const on = (d: string) => new Date(`${d}T12:00`);

describe("renewal reminders", () => {
  it("says nothing mid-season, then reminds from June until next season is paid", () => {
    expect(renewReminder(plan({}), on("2027-03-01"))).toBeNull();
    expect(renewReminder(plan({}), on("2027-06-02"))).toBe(
      "Renew for next season: this one ends July 31.",
    );
    expect(renewReminder(plan({ nextSeason: true }), on("2027-06-02"))).toBeNull();
    expect(renewReminder(plan({ kind: "launch" }), on("2027-07-10"))).toMatch(
      /Renew for next season/,
    );
  });

  it("warns in the last week of a trial, during grace, and once locked", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const d = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    expect(renewReminder(plan({ kind: "trial", until: d }))).toBe(
      "Your free trial ends in 3 days.",
    );
    expect(renewReminder(plan({ kind: "grace", until: "2027-08-05" }))).toMatch(/Aug 5, 2027/);
    expect(renewReminder(plan({ paid: false, kind: "none", until: null }))).toMatch(/locked/);
  });

  it("describes each plan", () => {
    expect(planLine(plan({ kind: "launch" }))).toMatch(/Free through Jul 31, 2027/);
    expect(planLine(plan({ kind: "club" }))).toMatch(/by the team's club/);
    expect(planLine(plan({ kind: "none", paid: false }))).toMatch(/locked/);
  });
});
