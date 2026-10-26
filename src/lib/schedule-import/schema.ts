// What Claude returns when reading a schedule file (JSON schema for structured output).

export interface ExtractedPractice {
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM, 24-hour
  end_time: string | null;
  location: string | null;
  note: string | null;
}

export interface ExtractedGame {
  date: string;
  start_time: string | null;
  opponent: string | null;
  location: string | null;
  note: string | null;
  /** Rain dates, "if needed" tournament days, TBD events: shown unchecked. */
  tentative: boolean;
}

export interface ScheduleExtraction {
  practices: ExtractedPractice[];
  games: ExtractedGame[];
  /** Assumptions or anything the coach should double-check. */
  warnings: string[];
}

const nullableString = { type: ["string", "null"] };

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["practices", "games", "warnings"],
  properties: {
    practices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "start_time", "end_time", "location", "note"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { ...nullableString, description: "HH:MM 24-hour, or null" },
          end_time: { ...nullableString, description: "HH:MM 24-hour, or null" },
          location: nullableString,
          note: nullableString,
        },
      },
    },
    games: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "start_time", "opponent", "location", "note", "tentative"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { ...nullableString, description: "HH:MM 24-hour, or null" },
          opponent: nullableString,
          location: nullableString,
          note: nullableString,
          tentative: { type: "boolean" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;
