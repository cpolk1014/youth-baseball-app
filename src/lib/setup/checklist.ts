// Setup checklists: what a new head coach, or a new club director, does first, worked out
// from what's already there (pure: no I/O, no React). Each step ticks itself off once done.
import { splitGames } from "@/lib/data/game";
import type { AppData } from "@/lib/data/types";

export interface SetupStep {
  id: string;
  title: string;
  /** Why it matters, or how, in a line. */
  detail: string;
  href: string;
  /** The button: "Add players". */
  action: string;
  done: boolean;
}

/** A roster this big counts as entered (a 7U might carry 9; most teams 11 or 12). */
export const ROSTER_READY = 8;

/** A head coach's first steps, in order. */
export function coachSetup(data: AppData, today: string): SetupStep[] {
  const active = data.players.filter((p) => p.active).length;
  const { upcoming } = splitGames(data.games);
  const next = upcoming.find((g) => g.date >= today) ?? upcoming[0];
  const families = data.members.some((m) => m.role === "parent");
  const lineup = data.games.some((g) => data.lineups[g.id]);
  const look = (data.team.colors?.length ?? 0) > 0 || Boolean(data.team.logoPath);
  return [
    {
      id: "roster",
      title: "Add your players",
      detail:
        active === 0
          ? "Type them in, or import the roster from a screenshot, photo, PDF or spreadsheet."
          : `${active} so far. Add the rest so lineups include everyone.`,
      href: "/roster",
      action: "Add players",
      done: active >= ROSTER_READY,
    },
    {
      id: "games",
      title: "Add your games",
      detail: "One at a time, or a picture of the schedule and Fungo adds them all.",
      href: "/games",
      action: "Add games",
      done: data.games.length > 0,
    },
    {
      id: "families",
      title: "Invite your families",
      detail: "Send parents one link. They get the schedule, Chatter and their kid's playing time.",
      href: "/members",
      action: "Invite",
      done: families,
    },
    {
      id: "lineup",
      title: "Make your first lineup",
      detail: "Tap Auto-fill on a game: every inning filled, fair to every kid.",
      href: next ? `/games/${next.id}` : "/games",
      action: "Make a lineup",
      done: lineup,
    },
    {
      id: "look",
      title: "Pick your team colors",
      detail: "Your colors and logo on every screen, printout and batting order picture.",
      href: "/team-look",
      action: "Pick colors",
      done: look,
    },
  ];
}

/** What a club director has set up so far. */
export interface ClubSetupFacts {
  /** A logo or colors on the club's Look. */
  hasLook: boolean;
  /** Practice plans and play sets in the club's Library. */
  libraryItems: number;
  /** Codes for the season. */
  codes: number;
  /** Teams that have entered a code. */
  teams: number;
}

/** A club director's first steps, in order. Their tabs are on the club page. */
export function clubSetup(f: ClubSetupFacts): SetupStep[] {
  return [
    {
      id: "look",
      title: "Add your club's logo and colors",
      detail: "Upload the logo or a flyer and Fungo finds your colors. Teams can wear them.",
      href: "#look",
      action: "Open Look",
      done: f.hasLook,
    },
    {
      id: "library",
      title: "Share a practice plan",
      detail: "Every coach in the club can copy it. Upload a PDF and Fungo reads the drills.",
      href: "#library",
      action: "Open Library",
      done: f.libraryItems > 0,
    },
    {
      id: "codes",
      title: "Get a code for each team",
      detail: "One code per team for the season. Buy them when your teams are ready.",
      href: "#codes",
      action: "Get codes",
      done: f.codes > 0,
    },
    {
      id: "teams",
      title: "Send each head coach their code",
      detail: "They enter it on Coaches & parents, and their team shows up here.",
      href: "#codes",
      action: "Share codes",
      done: f.teams > 0,
    },
  ];
}

/** How far along a checklist is. */
export function setupProgress(steps: SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

/** A club team's own setup, from the club's dashboard numbers. */
export function teamSetup(t: { players: number; games: number; lastLineupAt: string | null }): {
  done: number;
  total: number;
  missing: string[];
} {
  const steps: [boolean, string][] = [
    [t.players >= ROSTER_READY, "roster"],
    [t.games > 0, "games"],
    [t.lastLineupAt !== null, "a lineup"],
  ];
  return {
    done: steps.filter(([ok]) => ok).length,
    total: steps.length,
    missing: steps.filter(([ok]) => !ok).map(([, what]) => what),
  };
}
