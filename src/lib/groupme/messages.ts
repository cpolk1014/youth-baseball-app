import type { Lineup, Player } from "@/lib/rules/types";

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

export interface BattingOrderMessageInput {
  opponent: string;
  /** e.g. "Sat, Oct 24 · 9:00 AM" */
  when: string;
  location: string | null;
  players: Player[];
  lineup: Lineup;
}

/** The game's batting order as a GroupMe post (no field positions). */
export function battingOrderMessage(input: BattingOrderMessageInput): string {
  const { players, lineup } = input;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? "Unknown player";
  const lines = [
    `⚾ Batting order: ${input.opponent.trim() ? `vs ${input.opponent.trim()}` : "next game"}`,
    [input.when, input.location].filter(Boolean).join(" · "),
    "",
    ...lineup.battingOrder.map((id, i) => `${i + 1}. ${name(id)}`),
  ];
  const sitting = (lineup.notBatting ?? []).map(name);
  if (sitting.length) lines.push("", `Not batting today: ${sitting.join(", ")}`);
  const absent = (lineup.absent ?? []).map(name);
  if (absent.length) lines.push("", `Not at this game: ${absent.join(", ")}`);
  lines.push("", "Sent from RallyCap.");
  return lines.join("\n");
}

export interface BatAroundMessageInput {
  title: string;
  totalCents: number;
  /** How many players it's split across. */
  players: number;
  /** Each player's share, e.g. "$100.00" or "$730.18–$730.19" when it doesn't split evenly. */
  each: string;
  /** A family's installments (due date and amount), or one payment. */
  installments: { dueDate: string; amountCents: number }[];
  /** Where families see their balance, e.g. "https://www.rallycap.team/money". */
  link: string;
  format: (cents: number) => string;
  formatDate: (date: string) => string;
}

/**
 * A new Bat Around for the team's GroupMe: the total, each family's share and when it's
 * due. Every family's share is the same (to the penny), so nobody's balance is shown.
 */
export function batAroundMessage(input: BatAroundMessageInput): string {
  const { format, formatDate, installments } = input;
  const lines = [
    `💵 New team expense: ${input.title.trim()}`,
    `${format(input.totalCents)} total, split ${input.players} ways: ${input.each} per player.`,
  ];
  if (installments.length > 1) {
    lines.push(
      "",
      `${installments.length} payments:`,
      ...installments.map((i) => `• ${format(i.amountCents)} due ${formatDate(i.dueDate)}`),
    );
  } else if (installments[0]) {
    lines.push(`Due ${formatDate(installments[0].dueDate)}.`);
  }
  lines.push("", `See your balance in RallyCap: ${input.link}`);
  return lines.join("\n");
}
