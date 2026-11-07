// Club awards: the club's list, the board of picks, and the GroupMe messages. Pure.

export interface ClubAward {
  id: string;
  season: string;
  name: string;
  description: string | null;
  emoji: string | null;
  sort: number;
  liveAt: string | null;
  dueOn: string | null;
}

/** One award × one team on the board (player null: still to pick). */
export interface BoardRow {
  awardId: string;
  teamId: string;
  teamName: string;
  ageGroup: string;
  headCoach: string | null;
  playerId: string | null;
  playerName: string | null;
  jerseyNumber: number | null;
  note: string | null;
  pickedAt: string | null;
}

/** A team's view of one live award (from team_club_awards). */
export interface TeamAward {
  awardId: string;
  clubName: string;
  name: string;
  description: string | null;
  emoji: string | null;
  dueOn: string;
  open: boolean;
  playerId: string | null;
  note: string | null;
  pickedAt: string | null;
}

/** Ready-made awards a club can add in one tap (generic names, no trademarks). */
export const AWARD_PRESETS: { name: string; emoji: string; description: string }[] = [
  {
    name: "Team MVP",
    emoji: "🏆",
    description: "The player who meant the most to the team this season.",
  },
  {
    name: "Best Teammate",
    emoji: "🤝",
    description: "Picks others up, cheers the loudest, puts the team first.",
  },
  {
    name: "Most Improved",
    emoji: "📈",
    description: "Grew the most from the first practice to the last game.",
  },
  {
    name: "Hustle Award",
    emoji: "💨",
    description: "Never stops running out ground balls or backing up plays.",
  },
  { name: "Top Glove", emoji: "🧤", description: "The season's best defender." },
  { name: "Top Bat", emoji: "🏏", description: "The season's best hitter." },
  { name: "Top Arm", emoji: "🔥", description: "The season's best pitcher." },
  {
    name: "Coach's Award",
    emoji: "⭐",
    description: "The coach's own pick, for whatever made this player special.",
  },
];

export type CellState = "picked" | "pending" | "late";

export function cellState(
  row: Pick<BoardRow, "playerId">,
  dueOn: string | null,
  today: string,
): CellState {
  if (row.playerId) return "picked";
  return dueOn && today > dueOn ? "late" : "pending";
}

export interface AwardProgress {
  award: ClubAward;
  picked: number;
  teams: number;
}

export interface TeamProgress {
  teamId: string;
  teamName: string;
  ageGroup: string;
  headCoach: string | null;
  picked: number;
  awards: number;
  /** Awards this team still has to pick (names, in award order). */
  missing: string[];
  cells: Record<string, BoardRow>;
}

export interface BoardSummary {
  live: ClubAward[];
  byAward: AwardProgress[];
  byTeam: TeamProgress[];
  picked: number;
  total: number;
  /** Teams with at least one pick missing. */
  teamsToPick: TeamProgress[];
}

const byOrder = (a: ClubAward, b: ClubAward) => a.sort - b.sort || a.name.localeCompare(b.name);

export function summarizeBoard(awards: ClubAward[], rows: BoardRow[]): BoardSummary {
  const live = awards.filter((a) => a.liveAt).sort(byOrder);
  const liveIds = new Set(live.map((a) => a.id));
  const teams = new Map<string, TeamProgress>();
  for (const r of rows) {
    if (!liveIds.has(r.awardId)) continue;
    let t = teams.get(r.teamId);
    if (!t) {
      t = {
        teamId: r.teamId,
        teamName: r.teamName,
        ageGroup: r.ageGroup,
        headCoach: r.headCoach,
        picked: 0,
        awards: 0,
        missing: [],
        cells: {},
      };
      teams.set(r.teamId, t);
    }
    t.cells[r.awardId] = r;
  }
  const byTeam = [...teams.values()].sort(
    (a, b) =>
      a.ageGroup.localeCompare(b.ageGroup, undefined, { numeric: true }) ||
      a.teamName.localeCompare(b.teamName),
  );
  for (const t of byTeam) {
    for (const a of live) {
      const cell = t.cells[a.id];
      if (!cell) continue;
      t.awards++;
      if (cell.playerId) t.picked++;
      else t.missing.push(a.name);
    }
  }
  const byAward = live.map((award) => ({
    award,
    teams: byTeam.filter((t) => t.cells[award.id]).length,
    picked: byTeam.filter((t) => t.cells[award.id]?.playerId).length,
  }));
  const picked = byTeam.reduce((n, t) => n + t.picked, 0);
  const total = byTeam.reduce((n, t) => n + t.awards, 0);
  return {
    live,
    byAward,
    byTeam,
    picked,
    total,
    teamsToPick: byTeam.filter((t) => t.picked < t.awards),
  };
}

/** "Fri, Mar 13" for a YYYY-MM-DD date. */
export function dueText(dueOn: string): string {
  return new Date(`${dueOn}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** The coaches group post when the club makes awards live. */
export function liveMessage(
  clubName: string,
  awards: Pick<ClubAward, "name" | "emoji">[],
  dueOn: string,
): string {
  const list = awards.map((a) => `${a.emoji ? `${a.emoji} ` : ""}${a.name}`).join("\n");
  return `${clubName} season awards are open!\n${list}\nCoaches: pick your winners in RallyCap (it's on your Home To do) by ${dueText(dueOn)}. Picks stay private until the awards show.`;
}

/** The coaches group nudge: which teams still have picks to make. */
export function reminderMessage(
  summary: BoardSummary,
  dueOn: string | null,
  today: string,
): string {
  const late = dueOn !== null && today > dueOn;
  const lines = summary.teamsToPick.map(
    (t) =>
      `• ${t.ageGroup} ${t.teamName}${t.headCoach ? ` (${t.headCoach})` : ""}: ${t.missing.join(", ")}`,
  );
  const head = late
    ? `Award picks were due ${dueText(dueOn!)}. Still waiting on:`
    : `Reminder: award picks are due${dueOn ? ` ${dueText(dueOn)}` : " soon"}. Still waiting on:`;
  return `${head}\n${lines.join("\n")}\nPick yours in RallyCap from your Home To do. Thanks, coaches!`;
}

/** Winners for the awards show: each award, then age group order. */
export function showList(summary: BoardSummary): { award: ClubAward; winners: BoardRow[] }[] {
  return summary.live.map((award) => ({
    award,
    winners: summary.byTeam
      .map((t) => t.cells[award.id])
      .filter((c): c is BoardRow => !!c?.playerId),
  }));
}

/** The latest due date among live awards (they're made live together). */
export function boardDue(awards: ClubAward[]): string | null {
  return awards.reduce<string | null>(
    (d, a) => (a.liveAt && a.dueOn && (!d || a.dueOn > d) ? a.dueOn : d),
    null,
  );
}

/** Live awards a team's coach still has to pick, while picking is open. */
export function awardsToPick(awards: TeamAward[] | undefined): TeamAward[] {
  return (awards ?? []).filter((a) => a.open && !a.playerId);
}

/** "Pick your club awards: Team MVP, Best Teammate (due Fri, Nov 20)". */
export function pickText(toPick: TeamAward[]): string {
  if (toPick.length === 0) return "";
  const due = toPick.reduce((d, a) => (a.dueOn < d ? a.dueOn : d), toPick[0]!.dueOn);
  const names = toPick.map((a) => a.name);
  const list =
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  return `Pick your club award${toPick.length === 1 ? "" : "s"}: ${list} (due ${dueText(due)})`;
}
