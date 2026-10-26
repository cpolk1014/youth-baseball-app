// What each role can do in the app. Mirrors the database's Row Level Security, which is
// what actually enforces it; this only decides which buttons to show.

export type MemberRole = "coach" | "manager" | "treasurer" | "parent";

export interface Permissions {
  /** Field positions, batting order, attendance, auto-fill. */
  editLineups: boolean;
  /** Roster, games, coach's pitch. */
  editTeam: boolean;
  /** Invite links, roles, removing people. */
  manageMembers: boolean;
}

const RANK: MemberRole[] = ["coach", "manager", "treasurer", "parent"];

export function permissionsFor(role: MemberRole): Permissions {
  return {
    editLineups: role === "coach",
    editTeam: role === "coach" || role === "manager",
    manageMembers: role === "coach",
  };
}

/** A person can hold several roles on a team; the strongest one wins. */
export function bestRole(roles: MemberRole[]): MemberRole {
  return RANK.find((r) => roles.includes(r)) ?? "parent";
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  coach: "Coach",
  manager: "Manager",
  treasurer: "Treasurer",
  parent: "Parent",
};
