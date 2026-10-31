// Reading GameChanger's team stats export (CSV): a group row (Batting, Pitching,
// Fielding), a header row (Number, Last, First, then stat columns), one row per player,
// a Totals row, and a Glossary row of "KEY=What it means" cells under the columns.

export interface StatColumn {
  group: string;
  key: string;
  /** From GameChanger's glossary, e.g. "Batting average". */
  description: string | null;
}

export interface StatPlayer {
  number: string;
  first: string;
  last: string;
  /** One per column, as GameChanger wrote it ("0.305", "36.1", "-", "N/A"). */
  values: string[];
  /** The roster player they were matched to; null for someone not on the roster. */
  playerId: string | null;
}

export interface TeamStats {
  columns: StatColumn[];
  players: StatPlayer[];
  totals: string[] | null;
}

export const MAX_STAT_PLAYERS = 60;
export const MAX_STAT_COLUMNS = 400;

/** CSV rows: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const blank = (row: string[]) => row.every((c) => c.trim() === "");

/** Parse the export; throws a message a coach can act on when it isn't one. */
export function parseGameChangerStats(text: string): TeamStats {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex(
    (r) =>
      r[0]?.trim().toLowerCase() === "number" &&
      r[1]?.trim().toLowerCase() === "last" &&
      r[2]?.trim().toLowerCase() === "first",
  );
  if (headerAt < 1) {
    throw new Error(
      "This doesn't look like GameChanger's team stats export. In GameChanger, open the team's Stats and export them as a CSV.",
    );
  }
  const groupRow = rows[headerAt - 1]!;
  const header = rows[headerAt]!;
  const width = header.length;
  if (width - 3 > MAX_STAT_COLUMNS) throw new Error("This file has too many columns.");

  let group = "";
  const groups: string[] = [];
  for (let i = 3; i < width; i++) {
    group = groupRow[i]?.trim() || group;
    groups.push(group || "Stats");
  }

  const players: StatPlayer[] = [];
  let totals: string[] | null = null;
  let glossary: string[] | null = null;
  for (const r of rows.slice(headerAt + 1)) {
    const first = r[0]?.trim() ?? "";
    if (first.toLowerCase() === "glossary") {
      glossary = r;
      continue;
    }
    if (blank(r)) continue;
    const values = Array.from({ length: width - 3 }, (_, i) => (r[i + 3] ?? "").trim());
    if (first.toLowerCase() === "totals") {
      totals = values;
      continue;
    }
    const name = { first: (r[2] ?? "").trim(), last: (r[1] ?? "").trim() };
    if (!name.first && !name.last) continue;
    players.push({ number: first, ...name, values, playerId: null });
  }
  if (players.length === 0) throw new Error("There are no players in this file.");
  if (players.length > MAX_STAT_PLAYERS) throw new Error("This file has too many players.");

  const columns = groups.map((g, i): StatColumn => {
    const key = header[i + 3]!.trim();
    const cell = glossary?.[i + 3]?.trim() ?? "";
    const description = cell.startsWith(`${key}=`) ? cell.slice(key.length + 1).trim() : null;
    return { group: g, key, description: description || null };
  });
  return { columns, players, totals };
}

/** The groups in file order (Batting, Pitching, Fielding). */
export function statGroups(stats: TeamStats): string[] {
  return [...new Set(stats.columns.map((c) => c.group))];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface RosterPlayer {
  id: string;
  name: string;
  jerseyNumber?: number | null;
}

/**
 * Best roster match for each GameChanger player: full name, then first name + last
 * initial (rosters often use "Mason R."), then a jersey number nobody else has when the
 * first name or whole last name also agrees.
 * Each roster player is used once.
 */
export function matchRoster(players: StatPlayer[], roster: RosterPlayer[]): (string | null)[] {
  const taken = new Set<string>();
  const result: (string | null)[] = players.map(() => null);
  const tries: ((p: StatPlayer, r: RosterPlayer) => boolean)[] = [
    (p, r) => norm(r.name) === norm(`${p.first} ${p.last}`),
    (p, r) => {
      const n = norm(r.name).split(" ");
      return (
        n.length === 2 &&
        n[1]!.length === 1 &&
        n[0] === norm(p.first).split(" ")[0] &&
        n[1] === norm(p.last)[0]
      );
    },
    (p, r) =>
      p.number !== "" &&
      r.jerseyNumber != null &&
      String(r.jerseyNumber) === p.number.replace(/^0+(?=\d)/, "") &&
      roster.filter((x) => String(x.jerseyNumber) === String(r.jerseyNumber)).length === 1 &&
      // A number alone could be a different kid (numbers change): the first name or the
      // whole last name must agree too.
      (norm(r.name).split(" ")[0] === norm(p.first).split(" ")[0] ||
        norm(r.name).split(" ").at(-1) === norm(p.last)),
  ];
  for (const test of tries) {
    players.forEach((p, i) => {
      if (result[i]) return;
      const hits = roster.filter((r) => !taken.has(r.id) && test(p, r));
      if (hits.length === 1) {
        result[i] = hits[0]!.id;
        taken.add(hits[0]!.id);
      }
    });
  }
  return result;
}

/** A value as a number for sorting; null for "-", "N/A", blanks and odd cells. */
export function statNumber(value: string): number | null {
  if (!/^-?\d*\.?\d+%?$/.test(value)) return null;
  return Number(value.replace("%", ""));
}

/** True when a player has nothing in a group (e.g. a kid who never pitched). */
export function emptyIn(values: string[], indexes: number[]): boolean {
  return indexes.every((i) => {
    const v = values[i] ?? "";
    return v === "" || v === "-" || v === "N/A" || statNumber(v) === 0 || v === "0-0";
  });
}

/** Columns shown first; the rest are behind "All columns". */
export const KEY_COLUMNS: Record<string, string[]> = {
  Batting: [
    "GP",
    "PA",
    "AB",
    "AVG",
    "OBP",
    "SLG",
    "OPS",
    "H",
    "2B",
    "3B",
    "HR",
    "RBI",
    "R",
    "BB",
    "SO",
    "SB",
  ],
  Pitching: ["IP", "GP", "BF", "#P", "ERA", "WHIP", "H", "R", "ER", "BB", "SO", "BAA", "S%"],
  Fielding: [
    "TC",
    "PO",
    "A",
    "E",
    "FPCT",
    "DP",
    "P",
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "LF",
    "CF",
    "RF",
  ],
};

/** Stats where lower is better, so the first tap on a column puts the best first. */
const LOWER_IS_BETTER: Record<string, Set<string>> = {
  Batting: new Set(["SO", "K-L", "CS", "PIK", "GIDP", "GITP", "LOB", "AB/HR", "PA/BB"]),
  Pitching: new Set([
    "ERA",
    "WHIP",
    "BAA",
    "H",
    "R",
    "ER",
    "BB",
    "HBP",
    "WP",
    "BK",
    "SB",
    "FIP",
    "P/IP",
    "P/BF",
    "BB/INN",
    "HR",
    "BABIP",
    "BA/RISP",
    "HHB%",
    "LD%",
  ]),
  Fielding: new Set(["E", "PB", "SB"]),
};

export function lowerIsBetter(column: StatColumn): boolean {
  return LOWER_IS_BETTER[column.group]?.has(column.key) ?? false;
}
