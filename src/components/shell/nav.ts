// The app's sections, shared by the menu (drawer and rail) and search.
import { isCoach, permissionsFor } from "@/lib/data/permissions";
import type { AppData } from "@/lib/data/types";
import type { IconName } from "./NavIcon";

export type Tab =
  | "home"
  | "games"
  | "tournaments"
  | "pa"
  | "practice"
  | "plays"
  | "season"
  | "stats"
  | "roster"
  | "money"
  | "awards"
  | "club"
  | "account";

export type MenuTab = {
  id: Tab;
  href: string;
  label: string;
  icon: IconName;
  staffOnly?: boolean;
  /** Hidden from parents (other kids' playing time). */
  notParents?: boolean;
  /** Only once the team has a tournament. */
  needsTournament?: boolean;
  /** Only while the team's club has awards live (coaches and managers). */
  needsAwards?: boolean;
};

/** The menu's sections, grouped by what people are doing. */
export const GAME_DAY: MenuTab[] = [
  {
    id: "tournaments",
    href: "/tournaments",
    label: "Tournaments",
    icon: "trophy",
    needsTournament: true,
  },
  { id: "games", href: "/games", label: "Games", icon: "games" },
  { id: "pa", href: "/pa", label: "Gameday PA", icon: "pa" },
];
export const TEAM: MenuTab[] = [
  { id: "roster", href: "/roster", label: "Roster", icon: "roster" },
  { id: "practice", href: "/practices", label: "Practice", icon: "practice" },
  { id: "plays", href: "/plays", label: "Plays", icon: "plays" },
  { id: "season", href: "/season", label: "Playing time", icon: "season", notParents: true },
  { id: "stats", href: "/stats", label: "Stats", icon: "stats", staffOnly: true },
  { id: "money", href: "/money", label: "Money", icon: "money" },
  {
    id: "awards",
    href: "/awards",
    label: "Club awards",
    icon: "medal",
    staffOnly: true,
    needsAwards: true,
  },
];
/** Home (the dashboard) is for tablets and bigger screens; phones open on Games. */
export const HOME: MenuTab = { id: "home", href: "/home", label: "Home", icon: "home" };

/** The menu's tabs this person sees. */
export function visibleTabs(tabs: MenuTab[], data: AppData | null): MenuTab[] {
  // Coaches (and owners) and managers.
  const staff = !!data && (isCoach(data.me.role) || data.me.role === "manager");
  return tabs.filter(
    (t) =>
      (!t.staffOnly || staff) &&
      (!t.notParents || data?.me.role !== "parent") &&
      (!t.needsTournament || (data?.tournamentCount ?? 0) > 0) &&
      (!t.needsAwards || (data?.clubAwards?.length ?? 0) > 0),
  );
}

/** Team settings links this person sees. */
export function settingsLinks(data: AppData | null, signedIn: boolean) {
  const perms = data ? permissionsFor(data.me.role) : null;
  return [
    {
      href: "/members",
      label: "Coaches & parents",
      icon: "members" as IconName,
      show: signedIn,
      also: [] as string[],
    },
    {
      href: "/season/rules",
      label: "Fair play rules",
      icon: "rules" as IconName,
      // Coaches' rules for building lineups; parents don't need them.
      show: data?.me.role !== "parent",
      also: [],
    },
    {
      href: "/team-look",
      label: "Colors, logo & uniforms",
      icon: "look" as IconName,
      show: !!perms?.editTeam,
      also: ["/uniforms"],
    },
    {
      href: "/groupme",
      label: "GroupMe",
      icon: "groupme" as IconName,
      show: signedIn && !!perms?.editTeam,
      also: [],
    },
  ].filter((x) => x.show);
}
