// The admin panel's numbers: what `admin_overview` returns, read safely, plus the few sums the
// page shows (paying teams, trial conversion). Pure: no I/O.

export type PlanKind = "club" | "pass" | "trial" | "launch" | "grace" | "none";

export const PLAN_LABEL: Record<PlanKind, string> = {
  club: "Club code",
  pass: "Team season",
  trial: "Free trial",
  launch: "Launch (free)",
  grace: "Grace days",
  none: "Expired / free plan",
};
export const PLAN_ORDER: PlanKind[] = ["club", "pass", "grace", "trial", "launch", "none"];

export interface AdminTeam {
  id: string;
  name: string;
  ageGroup: string;
  createdAt: string;
  plan: PlanKind;
  club: string | null;
  ownerEmail: string | null;
  players: number;
  games: number;
  lineups: number;
  people: number;
  parents: number;
  lastActive: string | null;
}

export interface AdminOverview {
  generatedAt: string;
  users: {
    total: number;
    new7: number;
    new30: number;
    active7: number;
    parents: number;
    coaches: number;
  };
  teams: {
    total: number;
    new7: number;
    new30: number;
    active14: number;
    byPlan: Record<PlanKind, number>;
  };
  clubs: { total: number; codesSold: number; codesUsed: number };
  revenue: {
    season: { club: number; team: number; family: number };
    last30: number;
    allTime: number;
    playerPasses: number;
    playerPassKids: number;
  };
  ai: {
    cents30: number;
    centsSeason: number;
    byKind30: { kind: string; calls: number; cents: number }[];
    topTeams30: { name: string; cents: number }[];
  };
  ask: {
    questions7: number;
    questions30: number;
    cents30: number;
    recent: { askedAt: string; question: string; outcome: string; page: string | null }[];
  };
  demo: { starts7: number; starts30: number; live: number };
  shares: {
    live: number;
    opens30: number;
    trialTaps30: number;
    top: { tournament: string; team: string; opens: number; trialTaps: number }[];
  };
  daily: { day: string; users: number; teams: number; cents: number }[];
  recentTeams: AdminTeam[];
  recentPurchases: {
    createdAt: string;
    kind: string;
    amountCents: number;
    quantity: number;
    what: string | null;
    buyerEmail: string | null;
  }[];
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? v.map(obj) : []);
const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const plan = (v: unknown): PlanKind =>
  (PLAN_ORDER as string[]).includes(v as string) ? (v as PlanKind) : "none";

/** The database's answer, with every number a number and every list a list. */
export function readOverview(raw: unknown): AdminOverview {
  const r = obj(raw);
  const users = obj(r.users);
  const teams = obj(r.teams);
  const byPlan = obj(teams.by_plan);
  const clubs = obj(r.clubs);
  const rev = obj(r.revenue);
  const season = obj(rev.season);
  const ai = obj(r.ai);
  const ask = obj(r.ask);
  const demo = obj(r.demo);
  const shares = obj(r.shares);
  return {
    generatedAt: s(r.generated_at),
    users: {
      total: n(users.total),
      new7: n(users.new_7),
      new30: n(users.new_30),
      active7: n(users.active_7),
      parents: n(users.parents),
      coaches: n(users.coaches),
    },
    teams: {
      total: n(teams.total),
      new7: n(teams.new_7),
      new30: n(teams.new_30),
      active14: n(teams.active_14),
      byPlan: Object.fromEntries(PLAN_ORDER.map((k) => [k, n(byPlan[k])])) as Record<
        PlanKind,
        number
      >,
    },
    clubs: {
      total: n(clubs.total),
      codesSold: n(clubs.codes_sold),
      codesUsed: n(clubs.codes_used),
    },
    revenue: {
      season: { club: n(season.club), team: n(season.team), family: n(season.family) },
      last30: n(rev.last_30),
      allTime: n(rev.all_time),
      playerPasses: n(rev.player_passes),
      playerPassKids: n(rev.player_pass_kids),
    },
    ai: {
      cents30: n(ai.cents_30),
      centsSeason: n(ai.cents_season),
      byKind30: arr(ai.by_kind_30).map((x) => ({
        kind: s(x.kind),
        calls: n(x.calls),
        cents: n(x.cents),
      })),
      topTeams30: arr(ai.top_teams_30).map((x) => ({ name: s(x.name), cents: n(x.cents) })),
    },
    ask: {
      questions7: n(ask.questions_7),
      questions30: n(ask.questions_30),
      cents30: n(ask.cents_30),
      recent: arr(ask.recent).map((x) => ({
        askedAt: s(x.asked_at),
        question: s(x.question),
        outcome: s(x.outcome),
        page: sn(x.page),
      })),
    },
    demo: { starts7: n(demo.starts_7), starts30: n(demo.starts_30), live: n(demo.live) },
    shares: {
      live: n(shares.live),
      opens30: n(shares.opens_30),
      trialTaps30: n(shares.trial_taps_30),
      top: arr(shares.top).map((x) => ({
        tournament: s(x.tournament),
        team: s(x.team),
        opens: n(x.opens),
        trialTaps: n(x.trial_taps),
      })),
    },
    daily: arr(r.daily).map((x) => ({
      day: s(x.day).slice(0, 10),
      users: n(x.users),
      teams: n(x.teams),
      cents: n(x.cents),
    })),
    recentTeams: arr(r.recent_teams).map((x) => ({
      id: s(x.id),
      name: s(x.name),
      ageGroup: s(x.age_group),
      createdAt: s(x.created_at),
      plan: plan(x.plan),
      club: sn(x.club),
      ownerEmail: sn(x.owner_email),
      players: n(x.players),
      games: n(x.games),
      lineups: n(x.lineups),
      people: n(x.people),
      parents: n(x.parents),
      lastActive: sn(x.last_active),
    })),
    recentPurchases: arr(r.recent_purchases).map((x) => ({
      createdAt: s(x.created_at),
      kind: s(x.kind),
      amountCents: n(x.amount_cents),
      quantity: n(x.quantity),
      what: sn(x.what),
      buyerEmail: sn(x.buyer_email),
    })),
  };
}

/** Teams paying today (a club code or their own season, including grace days). */
export const payingTeams = (o: AdminOverview) =>
  o.teams.byPlan.club + o.teams.byPlan.pass + o.teams.byPlan.grace;

/** This season's money, all kinds together (cents). */
export const seasonRevenue = (o: AdminOverview) =>
  o.revenue.season.club + o.revenue.season.team + o.revenue.season.family;

/** Of the shared-link visitors who saw the trial pitch, how many tapped it, as a percent. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/** Where a team is in getting set up: the first thing it's missing, or null when it's going. */
export function setupGap(t: Pick<AdminTeam, "players" | "games" | "lineups" | "parents">) {
  if (t.players === 0) return "No players";
  if (t.games === 0) return "No games";
  if (t.lineups === 0) return "No lineup";
  if (t.parents === 0) return "No parents";
  return null;
}

/** "3h ago", "2d ago", "Nov 4". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const ms = now - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
