// AI season practice plans: what we send Claude about the team's practices, and checking
// what comes back before a coach reviews it (pure: no I/O).
import type { Practice } from "@/lib/data/types";
import type { Play } from "@/lib/plays/types";
import { DRILL_LIBRARY, PRACTICE_FOCUSES } from "./drills";
import { practiceMinutes, type PlanItem } from "./schedule";

/** At most this many practices in one plan (a season's worth). */
export const MAX_PLANNED = 40;
/** A practice with no times set is planned for this long. */
export const DEFAULT_MINUTES = 75;
const MAX_DRILLS = 12;
const MAX_PROMPT = 4000;

export const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["season_notes", "practices"],
  properties: {
    season_notes: {
      type: "string",
      description: "Two or three sentences on how the season builds from first practice to last.",
    },
    practices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "focus", "theme", "drills", "play_ids", "coach_note"],
        properties: {
          id: { type: "string", description: "The practice id exactly as given." },
          focus: {
            anyOf: [{ type: "string", enum: [...PRACTICE_FOCUSES] }, { type: "null" }],
          },
          theme: { type: "string", description: "A short, kid-friendly theme for the day." },
          drills: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "minutes", "notes"],
              properties: {
                title: { type: "string" },
                minutes: { type: "integer" },
                notes: { type: "string", description: "How to run it: setup, coaching cues." },
              },
            },
          },
          play_ids: {
            type: "array",
            items: { type: "string" },
            description: "Ids from the play library to walk through as situations; may be empty.",
          },
          coach_note: {
            type: "string",
            description: "One or two sentences for the coach: the teammate lesson or fun twist.",
          },
        },
      },
    },
  },
} as const;

export interface PlannedPractice {
  practiceId: string;
  focus: string | null;
  theme: string;
  plan: PlanItem[];
  plays: string[];
  coachNote: string;
}

export interface SeasonPlan {
  seasonNotes: string;
  practices: PlannedPractice[];
}

/** 7 from "7U", "7u", "7 & under" or "Under 7"; null when the age group doesn't say. */
export function ageFromGroup(ageGroup: string | null | undefined): number | null {
  const m = /(\d{1,2})/.exec(ageGroup ?? "");
  const age = m ? Number(m[1]) : NaN;
  return age >= 4 && age <= 18 ? age : null;
}

/**
 * How practice should look at this age, sent with the request so a 13U plan differs from a
 * 7U one. Unknown ages get a note to go by what the coach wrote.
 */
export function ageGuidance(age: number | null): string {
  if (age === null) {
    return "The team's age isn't set: go by the coach's description, and keep it simple and active if unsure.";
  }
  if (age <= 8) {
    return `Ages ${age}U (8 and under): short drills (5-10 minutes), lots of movement, small groups and stations so nobody waits in a line of more than 3, simple language, games and imagination (animals, missions), plenty of praise. Fundamentals first: ready position, catching with two hands, throwing to a target, running the bases the right way, where to go on a ground ball. Very few situations, and only simple ones.`;
  }
  if (age <= 10) {
    return `Ages ${age}U (9-10): drills of 10-15 minutes in small groups. Build sound throwing, fielding and swing mechanics, and start situational play (force outs, where to throw with runners on, backing up, cutoffs). Introduce kid-pitch basics and catching (stance, receiving, blocking) with low pitch counts. Keep it competitive and fun, with plenty of reps for everyone.`;
  }
  if (age <= 12) {
    return `Ages ${age}U (11-12): drills of 10-20 minutes. More team defense (cutoffs and relays, bunt coverage, first-and-third, rundowns), signs and baserunning reads (leads, steals, tagging up). Pitchers and catchers get regular, low-count bullpen work with proper warm-up and rest. Hitters do more live and machine work and learn an approach at the plate. Explain the why behind each drill.`;
  }
  return `Ages ${age}U (13-14): full situational defense on the bigger field, pickoffs and holding runners, defensive signs and communication. Pitchers throw bullpens with tracked pitch counts and arm care (warm-up, rest days, no throwing through pain). Hitters see live pitching and work on an approach by count. Add age-appropriate conditioning and agility, give players more responsibility (leading warm-ups, captains), and keep practices efficient and game-like.`;
}

/** How long a practice runs, for fitting the drills to it. */
export function practiceLength(p: Pick<Practice, "startTime" | "endTime">): number {
  return practiceMinutes(p.startTime, p.endTime) ?? DEFAULT_MINUTES;
}

/** The coach's goals, tidied and capped. */
export function cleanPrompt(text: string): string {
  return text
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, MAX_PROMPT);
}

/** The message describing the team, its practices and our libraries, with the coach's goals. */
export function planRequestText(input: {
  teamName: string;
  ageGroup: string | null;
  coachPitch: boolean;
  activePlayers: number;
  goals: string;
  practices: Pick<Practice, "id" | "date" | "startTime" | "endTime" | "focus">[];
  plays: readonly Pick<Play, "id" | "name" | "category" | "situation">[];
}): string {
  const lines = [
    `Team: ${input.teamName}${input.ageGroup ? ` (${input.ageGroup})` : ""}, ${input.coachPitch ? "coach pitch" : "kid pitch"}, ${input.activePlayers} players.`,
    "",
    "How practice should look at this age:",
    ageGuidance(ageFromGroup(input.ageGroup)),
    "",
    "The coach's goals for the season:",
    cleanPrompt(input.goals),
    "",
    `Practices to plan, in order (${input.practices.length}):`,
    ...input.practices.map(
      (p, i) =>
        `${i + 1}. id=${p.id} · ${p.date} · ${practiceLength(p)} minutes${p.focus ? ` · coach's focus: ${p.focus}` : ""}`,
    ),
    "",
    "Starter drills you may use or adapt (title · minutes · how):",
    ...DRILL_LIBRARY.flatMap((c) =>
      c.drills.map((d) => `- [${c.category}] ${d.title} · ${d.minutes} · ${d.description}`),
    ),
    "",
    "Play library for situations (id · name · category · situation):",
    ...input.plays.map((p) => `- ${p.id} · ${p.name} · ${p.category} · ${p.situation}`),
  ];
  return lines.join("\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Keep only what fits: known practices (each once), focuses from our list, real play ids,
 * whole-minute drills, and no more drill time than the practice has (the last drills are
 * trimmed to fit).
 */
export function cleanPlan(
  raw: unknown,
  practices: Pick<Practice, "id" | "startTime" | "endTime">[],
  playIds: Set<string>,
  makeId: () => string = () => crypto.randomUUID(),
): SeasonPlan {
  const r = (raw ?? {}) as { season_notes?: unknown; practices?: unknown };
  const byId = new Map(practices.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: PlannedPractice[] = [];
  for (const item of Array.isArray(r.practices) ? r.practices : []) {
    const x = (item ?? {}) as Record<string, unknown>;
    const id = str(x.id, 100);
    const practice = byId.get(id);
    if (!practice || seen.has(id)) continue;
    seen.add(id);
    const length = practiceLength(practice);
    let left = length;
    const plan: PlanItem[] = [];
    for (const d of Array.isArray(x.drills) ? x.drills.slice(0, MAX_DRILLS) : []) {
      const drill = (d ?? {}) as Record<string, unknown>;
      const title = str(drill.title, 80);
      const asked = Math.round(Number(drill.minutes));
      if (!title || !Number.isFinite(asked) || asked < 1 || left <= 0) continue;
      const minutes = Math.min(asked, 60, left);
      left -= minutes;
      const notes = str(drill.notes, 400);
      plan.push({ id: makeId(), title, minutes, ...(notes ? { notes } : {}) });
    }
    const focus = (PRACTICE_FOCUSES as readonly string[]).includes(x.focus as string)
      ? (x.focus as string)
      : null;
    out.push({
      practiceId: id,
      focus,
      theme: str(x.theme, 80),
      plan,
      plays: [...new Set((Array.isArray(x.play_ids) ? x.play_ids : []).map((v) => str(v, 80)))]
        .filter((p) => playIds.has(p))
        .slice(0, 4),
      coachNote: str(x.coach_note, 400),
    });
  }
  // Same order as the schedule.
  const order = new Map(practices.map((p, i) => [p.id, i]));
  out.sort((a, b) => order.get(a.practiceId)! - order.get(b.practiceId)!);
  return { seasonNotes: str(r.season_notes, 800), practices: out };
}

/**
 * A practice with its AI plan applied: drills, plays and focus replace what was there; the
 * theme and coach note go in the notes, after anything the coach already wrote.
 */
export function applyPlan(practice: Practice, planned: PlannedPractice): Practice {
  const note = [planned.theme && `Theme: ${planned.theme}`, planned.coachNote]
    .filter(Boolean)
    .join("\n");
  const existing = practice.notes?.trim();
  return {
    ...practice,
    focus: planned.focus ?? practice.focus,
    plan: planned.plan,
    plays: planned.plays,
    notes: [existing, note].filter(Boolean).join("\n\n") || null,
  };
}
