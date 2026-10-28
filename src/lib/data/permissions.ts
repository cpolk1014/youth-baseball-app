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
  /** Add, edit and delete team money entries (coaches and treasurers). */
  editMoney: boolean;
  /** See every family's money, not just their own (coaches and treasurers). */
  seeAllMoney: boolean;
}

const RANK: MemberRole[] = ["coach", "manager", "treasurer", "parent"];

/** What a role can do; an optioned (archived) team is read-only for everyone. */
export function permissionsFor(role: MemberRole, optioned = false): Permissions {
  const money = role === "coach" || role === "treasurer";
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
    editLineups: role === "coach",
    editTeam: role === "coach" || role === "manager",
    manageMembers: role === "coach",
    editMoney: money,
    seeAllMoney: money,
  };
}

/** Coaches option a team, call it back up, and delete it (only once optioned). */
export function canCallUp(role: MemberRole): boolean {
  return role === "coach";
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
