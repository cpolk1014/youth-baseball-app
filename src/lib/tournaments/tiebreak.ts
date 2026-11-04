// Tournaments, phase 4: tie-break rules. An organization's rules (read from a screenshot)
// become an ordered list of criteria the standings engine knows how to apply (pure).

export const CRITERIA = [
  "head_to_head",
  "runs_allowed",
  "run_diff",
  "runs_scored",
  "runs_allowed_avg",
  "run_diff_avg",
  "runs_scored_avg",
  "coin_flip",
] as const;
export type CriterionType = (typeof CRITERIA)[number];

export interface Criterion {
  type: CriterionType;
  /** Most runs counted per game (e.g. run differential capped at 8 a game). */
  cap: number | null;
  /** The organization's own words, shown beside it. */
  text: string;
}

export interface RuleSet {
  id: string;
  name: string;
  organization: string | null;
  rules: Criterion[];
  /** Once a tie is partly broken, the teams still tied start over at the first criterion. */
  restart: boolean;
  notes: string | null;
}

export const CRITERION_LABEL: Record<CriterionType, string> = {
  head_to_head: "Head to head",
  runs_allowed: "Fewest runs allowed",
  run_diff: "Best run differential",
  runs_scored: "Most runs scored",
  runs_allowed_avg: "Fewest runs allowed per game",
  run_diff_avg: "Best run differential per game",
  runs_scored_avg: "Most runs scored per game",
  coin_flip: "Coin flip",
};

export const RUN_CRITERIA: ReadonlySet<CriterionType> = new Set([
  "runs_allowed",
  "run_diff",
  "runs_scored",
  "runs_allowed_avg",
  "run_diff_avg",
  "runs_scored_avg",
]);

/** How a criterion reads in the app, with its cap. */
export function describeCriterion(c: Pick<Criterion, "type" | "cap">): string {
  const base = CRITERION_LABEL[c.type];
  if (c.cap === null || !RUN_CRITERIA.has(c.type)) return base;
  return `${base} (max ${c.cap} a game)`;
}

export const TIEBREAK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["organization", "criteria", "restart", "seeding", "notes", "warnings"],
  properties: {
    organization: { type: ["string", "null"] },
    criteria: {
      type: "array",
      description: "In order. Only tie-breakers for teams with the same record.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "cap", "text"],
        properties: {
          type: { type: "string", enum: [...CRITERIA] },
          cap: {
            type: ["integer", "null"],
            description: "Most runs counted per game for this criterion, if the rules cap it.",
          },
          text: { type: "string", description: "The rule as written." },
        },
      },
    },
    restart: {
      type: "boolean",
      description:
        "True when, after a tie of 3 or more is partly broken, the teams still tied go back to the first tie-breaker (the usual rule).",
    },
    seeding: {
      type: "string",
      enum: ["overall", "pool", "unknown"],
      description: "Whether teams are seeded across all pool games or within each pool.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Anything else that matters for seeding (how records count, ties count as half a win, forfeits).",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Rules that don't fit the criteria (say which was used instead).",
    },
  },
} as const;

export interface ReadRules {
  organization: string | null;
  rules: Criterion[];
  restart: boolean;
  seeding: "overall" | "pool" | null;
  notes: string | null;
  warnings: string[];
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;

/** What came back from Claude, checked: known criteria only, each once (coin flip last). */
export function cleanRules(raw: unknown): ReadRules {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rules: Criterion[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.criteria) ? r.criteria : []) {
    const x = (c ?? {}) as Record<string, unknown>;
    const type = CRITERIA.find((t) => t === x.type);
    if (!type) continue;
    const cap =
      typeof x.cap === "number" && Number.isInteger(x.cap) && x.cap > 0 && x.cap <= 99
        ? x.cap
        : null;
    const key = `${type}:${cap ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ type, cap: RUN_CRITERIA.has(type) ? cap : null, text: str(x.text, 200) ?? "" });
  }
  const flip = rules.filter((c) => c.type === "coin_flip");
  const ordered = [...rules.filter((c) => c.type !== "coin_flip"), ...flip.slice(0, 1)];
  return {
    organization: str(r.organization, 80),
    rules: ordered.slice(0, 12),
    restart: r.restart !== false,
    seeding: r.seeding === "pool" ? "pool" : r.seeding === "overall" ? "overall" : null,
    notes: str(r.notes, 1000),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.flatMap((w) => str(w, 300) ?? []).slice(0, 10)
      : [],
  };
}

/** Rules read back from the database (or a draft), checked the same way. */
export function rulesFromJson(raw: unknown): Criterion[] {
  return cleanRules({ criteria: raw }).rules;
}
