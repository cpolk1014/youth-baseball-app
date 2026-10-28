import type { CustomRule, FieldPosition } from "./types";

// Turning a coach's typed rule into rule types. Claude answers in this shape (structured
// output); the server checks it before the app shows it.

export const RULE_KINDS = [
  "position-min",
  "position-max",
  "never-plays",
  "locked",
  "no-repeat-bench",
  "leadoff-rotation",
] as const;
const POSITIONS: FieldPosition[] = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "LCF",
  "RCF",
];

export type Outcome = "rule" | "clarify" | "split" | "unsupported";

export interface DraftRule {
  kind: (typeof RULE_KINDS)[number];
  positions: FieldPosition[];
  innings: number | null;
  playerName: string | null;
  position: FieldPosition | null;
  inning: number | null;
  strict: boolean;
}

export interface Interpretation {
  outcome: Outcome;
  /** "rule": one; "split": the pieces the app can do; "unsupported": the closest one, or none. */
  rules: DraftRule[];
  /** "clarify": what to ask the coach, with answers to tap. */
  question: string | null;
  options: string[];
  /** One or two sentences for the coach: what was understood, left out, or why not. */
  note: string;
}

/** JSON schema for Claude's answer (player names limited to the roster). */
export function interpretationSchema(playerNames: string[]) {
  const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["outcome", "rules", "question", "options", "note"],
    properties: {
      outcome: { type: "string", enum: ["rule", "clarify", "split", "unsupported"] },
      rules: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "positions", "innings", "playerName", "position", "inning", "strict"],
          properties: {
            kind: { type: "string", enum: [...RULE_KINDS] },
            positions: { type: "array", items: { type: "string", enum: POSITIONS } },
            innings: nullableInt,
            playerName: playerNames.length
              ? { anyOf: [{ type: "string", enum: playerNames }, { type: "null" }] }
              : { type: "null" },
            position: { anyOf: [{ type: "string", enum: POSITIONS }, { type: "null" }] },
            inning: nullableInt,
            strict: { type: "boolean" },
          },
        },
      },
      question: { anyOf: [{ type: "string" }, { type: "null" }] },
      options: { type: "array", items: { type: "string" } },
      note: { type: "string" },
    },
  } as const;
}

/**
 * A draft from Claude as a rule the app can run, or null if it's incomplete (a missing
 * player, positions, or number). Player names map to the roster.
 */
export function draftToRule(
  draft: DraftRule,
  players: { id: string; name: string }[],
  id: string,
  maxInnings = 9,
): CustomRule | null {
  const setting = draft.strict ? "block" : "warn";
  const playerId = players.find((p) => p.name === draft.playerName)?.id;
  const n = (v: number | null) =>
    v !== null && Number.isInteger(v) && v >= 1 && v <= maxInnings ? v : null;
  const positions = [...new Set(draft.positions.filter((p) => POSITIONS.includes(p)))];
  switch (draft.kind) {
    case "position-min":
    case "position-max": {
      const innings = n(draft.innings);
      return positions.length && innings
        ? { id, setting, kind: draft.kind, positions, innings }
        : null;
    }
    case "never-plays":
      return playerId && positions.length
        ? { id, setting, kind: draft.kind, playerId, positions }
        : null;
    case "locked": {
      const inning = n(draft.inning);
      return playerId && draft.position && inning
        ? { id, setting, kind: draft.kind, playerId, position: draft.position, inning }
        : null;
    }
    case "no-repeat-bench": {
      const inning = n(draft.inning);
      return inning ? { id, setting, kind: draft.kind, inning } : null;
    }
    case "leadoff-rotation":
      return { id, setting, kind: draft.kind };
  }
}
