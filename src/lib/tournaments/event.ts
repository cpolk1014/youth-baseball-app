// Tournaments, phase 1: reading an event's page or screenshot into its details and the
// teams in each division, and working out which teams are new (pure: no I/O).

export const MAX_PAGE_TEXT = 60_000;

export const EVENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_event",
    "name",
    "organization",
    "start_date",
    "end_date",
    "city",
    "venues",
    "divisions",
    "warnings",
  ],
  properties: {
    is_event: {
      type: "boolean",
      description: "Whether this is a youth baseball tournament or event page.",
    },
    name: { type: ["string", "null"] },
    organization: {
      type: ["string", "null"],
      description: "Who runs it, e.g. 2D Sports, USSSA, Perfect Game.",
    },
    start_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    end_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    city: { type: ["string", "null"], description: "City, ST" },
    venues: { type: "array", items: { type: "string" } },
    divisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "teams"],
        properties: {
          name: { type: "string", description: "As shown, e.g. 14u, 12U AA." },
          teams: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "hometown", "class_label"],
              properties: {
                name: { type: "string" },
                hometown: { type: ["string", "null"], description: "City, ST" },
                class_label: { type: ["string", "null"], description: "e.g. 14u AAA, Major" },
              },
            },
          },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export interface EventTeam {
  name: string;
  hometown: string | null;
  classLabel: string | null;
}

export interface EventDivision {
  name: string;
  teams: EventTeam[];
}

export interface EventDetails {
  isEvent: boolean;
  name: string | null;
  organization: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  venues: string[];
  divisions: EventDivision[];
  warnings: string[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** A page's readable text: no scripts or styles, one line per block, capped in length. */
export function htmlToText(html: string): string {
  return html
    .replace(/\s+/g, " ") // the page's own line breaks don't matter; tags decide
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<\/?(p|div|li|tr|h[1-6]|br|section|article|header|footer|table|ul|ol|a|td|th|span)\b[^>]*>/gi,
      (m) => (/^<\/?(span|a|td|th)/i.test(m) ? " " : "\n"),
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k]) return ENTITIES[k]!;
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    })
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PAGE_TEXT);
}

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * An event link we're willing to fetch: https on a public host name (no IP addresses,
 * no local or private names, no logins in the link). Null if not.
 */
export function safeEventUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || PRIVATE_HOST.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) return null;
  url.hash = "";
  return url;
}

/** Whether a resolved address is private, local or otherwise not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** Pages to read for an event: the link, and its /teams page when the link is the event. */
export function eventPages(url: URL): string[] {
  const base = url.toString().replace(/\/+$/, "");
  return /\/teams$/i.test(url.pathname.replace(/\/+$/, "")) ? [base] : [base, `${base}/teams`];
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** What came back from Claude, checked and tidied. */
export function cleanEvent(raw: unknown): EventDetails {
  const r = (raw ?? {}) as Record<string, unknown>;
  const divisions: EventDivision[] = [];
  for (const d of Array.isArray(r.divisions) ? r.divisions.slice(0, 40) : []) {
    const x = (d ?? {}) as Record<string, unknown>;
    const name = str(x.name, 40);
    if (!name) continue;
    const seen = new Set<string>();
    const teams: EventTeam[] = [];
    for (const t of Array.isArray(x.teams) ? x.teams.slice(0, 200) : []) {
      const y = (t ?? {}) as Record<string, unknown>;
      const teamName = str(y.name, 120);
      if (!teamName || seen.has(teamKey(teamName))) continue;
      seen.add(teamKey(teamName));
      teams.push({
        name: teamName,
        hometown: str(y.hometown, 80),
        classLabel: str(y.class_label, 60),
      });
    }
    divisions.push({ name, teams });
  }
  let start = date(r.start_date);
  let end = date(r.end_date);
  if (start && end && end < start) [start, end] = [end, start];
  return {
    isEvent: r.is_event === true,
    name: str(r.name, 120),
    organization: str(r.organization, 80),
    startDate: start,
    endDate: end,
    city: str(r.city, 80),
    venues: (Array.isArray(r.venues) ? r.venues : [])
      .map((v) => str(v, 120))
      .filter((v): v is string => !!v)
      .slice(0, 20),
    divisions,
    warnings: (Array.isArray(r.warnings) ? r.warnings : [])
      .map((v) => str(v, 300))
      .filter((v): v is string => !!v)
      .slice(0, 10),
  };
}

/** How we tell team names apart: case, spacing and punctuation don't count. */
export function teamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Teams in `found` that aren't already in the tournament. */
export function newTeams(existing: { name: string }[], found: EventTeam[]): EventTeam[] {
  const have = new Set(existing.map((t) => teamKey(t.name)));
  return found.filter((t) => {
    const k = teamKey(t.name);
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
}

/** The division matching the team's age group ("14U" → "14u"); null when none does. */
export function pickDivision(divisions: EventDivision[], ageGroup: string | null): string | null {
  const age = /(\d{1,2})/.exec(ageGroup ?? "")?.[1];
  if (!age) return null;
  const exact = divisions.find((d) => new RegExp(`(^|\\D)${age}\\s*u(\\b|$)`, "i").test(d.name));
  return (
    exact?.name ??
    divisions.find((d) => new RegExp(`(^|\\D)${age}(\\D|$)`).test(d.name))?.name ??
    null
  );
}

/** The team in the list most likely to be ours (same name, ignoring "14u" and spacing). */
export function guessOurTeam(teams: EventTeam[], teamName: string): string | null {
  const strip = (s: string) =>
    teamKey(s)
      .replace(/\b\d{1,2}u\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const ours = strip(teamName);
  if (!ours) return null;
  const hit =
    teams.find((t) => strip(t.name) === ours) ??
    teams.find((t) => strip(t.name).includes(ours) || ours.includes(strip(t.name)));
  return hit?.name ?? null;
}
