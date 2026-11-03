// The app's sections, shared by the menu (drawer and rail) and search.
import { isCoach, permissionsFor } from "@/lib/data/permissions";
import type { AppData } from "@/lib/data/types";
import type { IconName } from "./NavIcon";

export type Tab =
  | "home"
  | "games"
  | "pa"
  | "practice"
  | "plays"
  | "season"
  | "stats"
  | "roster"
  | "money"
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
};

/** The menu's sections, grouped by what people are doing. */
export const GAME_DAY: MenuTab[] = [
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
];
/** Home (the dashboard) is for tablets and bigger screens; phones open on Games. */
export const HOME: MenuTab = { id: "home", href: "/home", label: "Home", icon: "home" };

/** The menu's tabs this person sees. */
export function visibleTabs(tabs: MenuTab[], data: AppData | null): MenuTab[] {
  // Coaches (and owners) and managers; stays true on an optioned team, unlike editTeam.
  const staff = !!data && (isCoach(data.me.role) || data.me.role === "manager");
  return tabs.filter(
    (t) => (!t.staffOnly || staff) && (!t.notParents || data?.me.role !== "parent"),
  );
}

/** Team settings links this person sees. */
export function settingsLinks(data: AppData | null, signedIn: boolean) {
  const perms = data ? permissionsFor(data.me.role, data.team.optionedAt !== null) : null;
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
