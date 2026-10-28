// What each role can do in the app. Mirrors the database's Row Level Security, which is
// what actually enforces it; this only decides which buttons to show.

/** "owner" is whoever created the team: a coach who can never be removed or demoted. */
export type MemberRole = "owner" | "coach" | "manager" | "treasurer" | "parent";

export interface Permissions {
  /** Field positions, batting order, attendance, auto-fill. */
  editLineups: boolean;
  /** Roster, games, coach's pitch. */
  editTeam: boolean;
  /** Invite links, roles, removing people. */
  manageMembers: boolean;
  /** Add, edit and delete team money entries (coaches and treasurers). */
  editMoney: boolean;
  /** See every family's money, not just their own (coaches and treasurers). */
  seeAllMoney: boolean;
}

const RANK: MemberRole[] = ["owner", "coach", "manager", "treasurer", "parent"];

/** Owners can do everything coaches can. */
export function isCoach(role: MemberRole): boolean {
  return role === "owner" || role === "coach";
}

/** What a role can do; an optioned (archived) team is read-only for everyone. */
export function permissionsFor(role: MemberRole, optioned = false): Permissions {
  const money = isCoach(role) || role === "treasurer";
  if (optioned) {
    return {
      editLineups: false,
      editTeam: false,
      manageMembers: false,
      editMoney: false,
      seeAllMoney: money,
    };
  }
  return {
    editLineups: isCoach(role),
    editTeam: isCoach(role) || role === "manager",
    manageMembers: isCoach(role),
    editMoney: money,
    seeAllMoney: money,
  };
}

/** Coaches option a team, call it back up, and delete it (only once optioned). */
export function canCallUp(role: MemberRole): boolean {
  return isCoach(role);
}

/** A person can hold several roles on a team; the strongest one wins. */
export function bestRole(roles: MemberRole[]): MemberRole {
  return RANK.find((r) => roles.includes(r)) ?? "parent";
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Owner",
  coach: "Coach",
  manager: "Manager",
  treasurer: "Treasurer",
  parent: "Parent",
};
