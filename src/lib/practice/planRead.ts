// Reading a club's practice plans from a PDF or screenshots (Claude, structured output), and
// cleaning what comes back before the director reviews it. Pure: no I/O.
import { DRILL_NOTES_MAX } from "./aiPlan";
import { PRACTICE_FOCUSES } from "./drills";

/** A club plan as read, before it's saved (same shape as a club practice plan's items). */
export interface ReadPlan {
  title: string;
  focus: string | null;
  items: { title: string; minutes: number; notes?: string }[];
}

/** Up to this many files (pictures or PDFs) in one read. */
export const MAX_PLAN_FILES = 6;
/** Plans and drills kept from one read (the database keeps up to 40 drills a plan). */
export const MAX_READ_PLANS = 12;
export const MAX_PLAN_DRILLS = 40;
export const DRILL_TITLE_MAX = 80;
export const PLAN_TITLE_MAX = 80;

export const PLAN_READ_SCHEMA = {
  type: "object",
  properties: {
    plans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          focus: { type: ["string", "null"] },
          drills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                minutes: { type: "integer" },
                notes: { type: "string" },
              },
              required: ["title", "minutes", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "focus", "drills"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["plans", "warnings"],
  additionalProperties: false,
} as const;

export const PLAN_READ_PROMPT = `You read youth baseball practice plans (PDFs, photos or screenshots a club director uploads: workout itineraries, station rotations, drill sheets) and turn them into practice plans for a team app. Coaches copy these plans onto their practices.

Rules:
- One plan per practice or workout the file describes. Several pages describing one workout are one plan. Name it the way the file does (e.g. "Winter Workouts"), short, up to 60 characters.
- focus: the plan's main skill, exactly one of: ${PRACTICE_FOCUSES.join(", ")}; or null when it mixes several.
- A drill is one block of the practice in order: a warm-up, a station, a game. For a station rotation, make each station a drill (e.g. "Base running station") and put its numbered steps in the notes, so the plan's minutes match the practice.
- minutes: what the file says (a 25-minute station is 25). When it gives a time range, use its length. When it gives no time, estimate a sensible whole number (5 to 30) and add a warning that the minutes were guessed.
- notes: how to run the drill, from the file, as plain text for a coach reading on a phone: where it happens, reps, and each step with its coaching points. Keep the file's wording and numbered steps (one per line, "1. ..."). Leave out nothing a coach needs; up to 1,800 characters. Use an empty string when the file says nothing about how.
- Things that apply to the whole plan (the schedule, station locations, a coaching emphasis) aren't drills: put each location in its station's notes, and the coaching emphasis at the end of the first drill's notes.
- If the same text appears twice (a repeated line from the PDF), use it once. If a numbered step looks out of order or misplaced, put it where it belongs and keep its wording.
- Never include players' names, phone numbers or emails.
- If the file isn't a practice plan, return no plans and a warning saying so.`;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max).trim() : "";

/**
 * Keep what fits a club plan: a title, a focus from our list, up to 40 drills each with a
 * title, whole minutes from 1 to 120 (10 when missing) and how-to notes up to the drill
 * limit. Plans with no title get "Practice plan N"; plans with no drills are dropped.
 */
export function cleanReadPlans(raw: unknown): { plans: ReadPlan[]; warnings: string[] } {
  const r = (raw ?? {}) as { plans?: unknown; warnings?: unknown };
  const plans: ReadPlan[] = [];
  for (const p of Array.isArray(r.plans) ? r.plans : []) {
    if (plans.length >= MAX_READ_PLANS) break;
    const x = (p ?? {}) as Record<string, unknown>;
    const items: ReadPlan["items"] = [];
    for (const d of Array.isArray(x.drills) ? x.drills : []) {
      if (items.length >= MAX_PLAN_DRILLS) break;
      const drill = (d ?? {}) as Record<string, unknown>;
      const title = str(drill.title, DRILL_TITLE_MAX);
      if (!title) continue;
      const asked = Math.round(Number(drill.minutes));
      const minutes = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, 120) : 10;
      const notes = str(drill.notes, DRILL_NOTES_MAX);
      items.push({ title, minutes, ...(notes ? { notes } : {}) });
    }
    if (items.length === 0) continue;
    const focus = (PRACTICE_FOCUSES as readonly string[]).includes(x.focus as string)
      ? (x.focus as string)
      : null;
    plans.push({
      title: str(x.title, PLAN_TITLE_MAX) || `Practice plan ${plans.length + 1}`,
      focus,
      items,
    });
  }
  const warnings = (Array.isArray(r.warnings) ? r.warnings : [])
    .map((w) => str(w, 300))
    .filter(Boolean)
    .slice(0, 10);
  return { plans, warnings };
}
