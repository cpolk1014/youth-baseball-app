import { buildLineupCard } from "@/lib/lineup/card";
import type { FieldPosition, Lineup, Player } from "@/lib/rules/types";

export const GROUPME_MAX = 1000;

/**
 * Split a message into parts of at most `max` characters, breaking between lines (and
 * mid-line only when one line is longer than `max`).
 */
export function splitMessage(text: string, max = GROUPME_MAX): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of text.trim().split("\n")) {
    for (let piece = line; ;) {
      const candidate = current ? `${current}\n${piece}` : piece;
      if (candidate.length <= max) {
        current = candidate;
        break;
      }
      if (current) {
        parts.push(current);
        current = "";
        continue;
      }
      parts.push(piece.slice(0, max));
      piece = piece.slice(max);
      if (!piece) break;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export interface LineupMessageInput {
  opponent: string;
  /** e.g. "Sat, Oct 24 · 9:00 AM" */
  when: string;
  location: string | null;
  players: Player[];
  lineup: Lineup;
  fieldPositions: FieldPosition[];
}

/**
 * The game's lineup as a GroupMe post: one line per kid with their spot each inning, in
 * batting order, so every family can find their player fast.
 */
export function lineupMessage(input: LineupMessageInput): string {
  const { players, lineup } = input;
  const card = buildLineupCard(players, lineup, input.fieldPositions);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "Unknown player";
  const spots = (positions: string[]) => positions.map((p) => p || "—").join(" ");

  const lines = [
    `⚾ Lineup: ${input.opponent.trim() ? `vs ${input.opponent.trim()}` : "next game"}`,
    [input.when, input.location].filter(Boolean).join(" · "),
    "",
  ];
  const batting = card.rows.filter((r) => r.order !== null);
  const sitting = card.rows.filter((r) => r.order === null);
  if (lineup.innings > 0) lines.push(`Innings 1–${lineup.innings}:`);
  for (const r of batting) lines.push(`${r.order}. ${r.name} · ${spots(r.positions)}`);
  if (sitting.length) {
    lines.push("", "Not batting today:");
    for (const r of sitting) lines.push(`${r.name} · ${spots(r.positions)}`);
  }
  const absent = (lineup.absent ?? []).map(name);
  if (absent.length) lines.push("", `Not at this game: ${absent.join(", ")}`);
  lines.push("", "BN = bench. Sent from RallyCap.");
  return lines.join("\n");
}
