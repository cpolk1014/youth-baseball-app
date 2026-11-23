// The admin panel's Plan tab: the Road to $1M and marketing plan targets measured from
// `admin_scoreboard`, and the to-do list (`admin_task`) grouped for the page. Pure: no I/O.
import { formatCents } from "@/lib/finance/money";

export interface Scoreboard {
  revenueSeason: number;
  clubsPaying: number;
  clubTeams: number;
  independentTeams: number;
  passFamilies: number;
  passKids: number;
  parentAccounts: number;
  parentsWithPass: number;
  aiCentsPaidSeason: number;
  payingTeams: number;
  trials: number;
  trials7DaysOld: number;
  trialsLineup7: number;
  trials30DaysOld: number;
  trialsPaid30: number;
  teamsWithPlayers: number;
  parentLinks: number;
  renewed: number;
}

const KEYS: Record<keyof Scoreboard, string> = {
  revenueSeason: "revenue_season",
  clubsPaying: "clubs_paying",
  clubTeams: "club_teams",
  independentTeams: "independent_teams",
  passFamilies: "pass_families",
  passKids: "pass_kids",
  parentAccounts: "parent_accounts",
  parentsWithPass: "parents_with_pass",
  aiCentsPaidSeason: "ai_cents_paid_season",
  payingTeams: "paying_teams",
  trials: "trials",
  trials7DaysOld: "trials_7_days_old",
  trialsLineup7: "trials_lineup_7",
  trials30DaysOld: "trials_30_days_old",
  trialsPaid30: "trials_paid_30",
  teamsWithPlayers: "teams_with_players",
  parentLinks: "parent_links",
  renewed: "renewed",
};

export function readScoreboard(raw: unknown): Scoreboard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Scoreboard;
  for (const [k, key] of Object.entries(KEYS) as [keyof Scoreboard, string][]) {
    const v = typeof r[key] === "string" ? Number(r[key]) : r[key];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return out;
}

export interface Goal {
  key: string;
  label: string;
  /** Where the target comes from. */
  source: "Road to $1M" | "Marketing plan" | "Both";
  /** What we're at, shown as is ("12", "$4,200", "18%"). */
  now: string;
  target: string;
  /** 0..1 toward the target, or null when it can't be measured yet. */
  progress: number | null;
  /** Lower is better (AI cost): the bar fills as it gets under the line. */
  under?: boolean;
  note?: string;
}

const pct = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const showPct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const cap = (x: number | null) => (x === null ? null : Math.max(0, Math.min(1, x)));
const money = (cents: number) => formatCents(Math.round(cents)).replace(/\.00$/, "");
const count = (n: number) => n.toLocaleString("en-US");

/** Each target with where it stands today. */
export function goals(s: Scoreboard): Goal[] {
  const attach = pct(s.parentsWithPass, s.parentAccounts);
  const aiPerTeam = s.payingTeams ? s.aiCentsPaidSeason / s.payingTeams : null;
  const lineup7 = pct(s.trialsLineup7, s.trials7DaysOld);
  const paid30 = pct(s.trialsPaid30, s.trials30DaysOld);
  const parentsPerTeam = s.teamsWithPlayers ? s.parentLinks / s.teamsWithPlayers : null;
  const renewal = pct(s.renewed, s.payingTeams);
  return [
    {
      key: "revenue",
      label: "Revenue this season",
      source: "Road to $1M",
      now: money(s.revenueSeason),
      target: "$1,000,000 (2027–28)",
      progress: cap(s.revenueSeason / 100_000_000),
    },
    {
      key: "clubs",
      label: "Clubs paying",
      source: "Both",
      now: count(s.clubsPaying),
      target: "5 by May 15 · 250",
      progress: cap(s.clubsPaying / 250),
      note: `${Math.min(s.clubsPaying, 5)} of 5 for spring`,
    },
    {
      key: "club_teams",
      label: "Club teams paying",
      source: "Road to $1M",
      now: count(s.clubTeams),
      target: "3,750",
      progress: cap(s.clubTeams / 3750),
    },
    {
      key: "independent",
      label: "Independent teams paying",
      source: "Road to $1M",
      now: count(s.independentTeams),
      target: "1,300",
      progress: cap(s.independentTeams / 1300),
    },
    {
      key: "passes",
      label: "Families with a Player pass",
      source: "Road to $1M",
      now: count(s.passFamilies),
      target: "22,220",
      progress: cap(s.passFamilies / 22220),
      note: `${count(s.passKids)} kids covered`,
    },
    {
      key: "attach",
      label: "Player pass attach",
      source: "Both",
      now: showPct(attach),
      target: "15% this spring · 40%",
      progress: cap(attach === null ? null : attach / 0.4),
      note: "Parents with a pass ÷ parents on teams",
    },
    {
      key: "ai",
      label: "AI cost per paying team",
      source: "Road to $1M",
      now: aiPerTeam === null ? "–" : formatCents(Math.round(aiPerTeam)),
      target: "Under $15 a season",
      progress: aiPerTeam === null ? null : cap(1 - aiPerTeam / 1500),
      under: true,
    },
    {
      key: "trials",
      label: "Trials started",
      source: "Marketing plan",
      now: count(s.trials),
      target: "300 by May 15",
      progress: cap(s.trials / 300),
      note: "Since Nov 23, 2026",
    },
    {
      key: "lineup7",
      label: "Trial → first lineup in 7 days",
      source: "Marketing plan",
      now: showPct(lineup7),
      target: "60%",
      progress: cap(lineup7 === null ? null : lineup7 / 0.6),
      note: `${s.trialsLineup7} of ${s.trials7DaysOld} trials a week old`,
    },
    {
      key: "paid30",
      label: "Trial → paid in 30 days",
      source: "Marketing plan",
      now: showPct(paid30),
      target: "25%",
      progress: cap(paid30 === null ? null : paid30 / 0.25),
      note: `${s.trialsPaid30} of ${s.trials30DaysOld} trials a month old`,
    },
    {
      key: "parents",
      label: "Parents per team",
      source: "Marketing plan",
      now: parentsPerTeam === null ? "–" : parentsPerTeam.toFixed(1),
      target: "8 or more",
      progress: cap(parentsPerTeam === null ? null : parentsPerTeam / 8),
    },
    {
      key: "renewal",
      label: "Teams renewing for next season",
      source: "Road to $1M",
      now: showPct(renewal),
      target: "80% (sold from June)",
      progress: cap(renewal === null ? null : renewal / 0.8),
      note: `${s.renewed} of ${s.payingTeams} paying teams`,
    },
    {
      key: "heard",
      label: '"How did you hear about us?" mix',
      source: "Marketing plan",
      now: "Not tracked yet",
      target: "Where to double down",
      progress: null,
      note: "Needs the question in team setup",
    },
  ];
}

// ── to-dos ──

export type TaskStatus = "todo" | "doing" | "done";
export type TaskSection = "foundation" | "weekly" | "parents" | "growth" | "decision" | "mine";

export interface Task {
  id: string;
  section: TaskSection;
  title: string;
  detail: string | null;
  dueWeek: string | null;
  status: TaskStatus;
  notes: string | null;
  doneAt: string | null;
  sort: number;
}

export const SECTIONS: { key: TaskSection; label: string; hint: string }[] = [
  { key: "weekly", label: "Week by week", hint: "Marketing plan §8" },
  { key: "foundation", label: "Foundation", hint: "Marketing plan §3: before spending a dollar" },
  { key: "parents", label: "Getting parents to 40%", hint: "Road to $1M" },
  { key: "growth", label: "Growth", hint: "Marketing plan §6 and the Road to $1M" },
  { key: "decision", label: "Decisions", hint: "Marketing plan §9" },
  { key: "mine", label: "My own", hint: "Things you add" },
];

export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

export function readTasks(rows: unknown): Task[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    return {
      id: String(r.id),
      section: (SECTIONS.some((x) => x.key === r.section) ? r.section : "mine") as TaskSection,
      title: String(r.title ?? ""),
      detail: str(r.detail),
      dueWeek: str(r.due_week),
      status: (["todo", "doing", "done"].includes(r.status as string)
        ? r.status
        : "todo") as TaskStatus,
      notes: str(r.notes),
      doneAt: str(r.done_at),
      sort: typeof r.sort === "number" ? r.sort : 0,
    };
  });
}

/** A section's to-dos: open ones by due week (then plan order), and the done ones apart. */
export function sectionTasks(tasks: Task[], section: TaskSection) {
  const mine = tasks.filter((t) => t.section === section);
  const open = mine
    .filter((t) => t.status !== "done")
    .sort(
      (a, b) =>
        (a.dueWeek ?? "9999").localeCompare(b.dueWeek ?? "9999") ||
        a.sort - b.sort ||
        a.title.localeCompare(b.title),
    );
  const done = mine
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  return { open, done };
}

/** "Week of Nov 23", with "· late" once that week is over and it isn't done. */
export function dueText(t: Pick<Task, "dueWeek" | "status">, today: string): string | null {
  if (!t.dueWeek) return null;
  const d = new Date(`${t.dueWeek}T12:00`);
  const label = `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const end = new Date(d.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  return t.status !== "done" && end <= today ? `${label} · late` : label;
}

/** How far along the whole list is. */
export function taskTotals(tasks: Task[]) {
  return {
    done: tasks.filter((t) => t.status === "done").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    total: tasks.length,
  };
}
