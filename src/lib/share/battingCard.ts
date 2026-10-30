import type { Lineup, Player } from "@/lib/rules/types";

// The shareable batting-order picture: what goes on it and how it's laid out. Pure; the
// drawing itself happens on a canvas in the browser (src/components/battingCardImage.ts).

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface BattingCardInput {
  teamName: string;
  opponent: string;
  /** e.g. "Sat, Oct 24 · 9:00 AM" */
  when: string;
  location: string | null;
  players: Player[];
  lineup: Lineup;
}

export interface BattingCardModel {
  teamName: string;
  matchup: string;
  details: string;
  batters: { order: number; name: string; jersey: string }[];
  /** Footnotes: who isn't batting and who's out. */
  notes: string[];
  /** Two columns when the order is long; sizes shrink to fit. */
  columns: 1 | 2;
  rowHeight: number;
  fontSize: number;
}

/** Everything on the picture, sized so up to 20 batters fit. */
export function battingCardModel(input: BattingCardInput): BattingCardModel {
  const byId = new Map(input.players.map((p) => [p.id, p]));
  const batters = input.lineup.battingOrder.map((id, i) => {
    const p = byId.get(id);
    return {
      order: i + 1,
      name: p?.name ?? "Unknown player",
      jersey: p?.jerseyNumber != null ? String(p.jerseyNumber) : "",
    };
  });
  const names = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => byId.get(id)?.name).filter((n): n is string => !!n);
  const notes = [
    names(input.lineup.notBatting).length
      ? `Not batting: ${names(input.lineup.notBatting).join(", ")}`
      : "",
    names(input.lineup.absent).length ? `Out today: ${names(input.lineup.absent).join(", ")}` : "",
  ].filter(Boolean);

  const columns = batters.length > 12 ? 2 : 1;
  const perColumn = Math.max(1, Math.ceil(batters.length / columns));
  // The list area is about 780px tall.
  const rowHeight = Math.min(84, Math.floor(780 / perColumn));
  const fontSize = Math.min(52, Math.floor(rowHeight * 0.62)) - (columns === 2 ? 6 : 0);
  return {
    teamName: input.teamName,
    matchup: `vs ${input.opponent.trim() || "TBD"}`,
    details: [input.when, input.location].filter(Boolean).join(" · "),
    batters,
    notes,
    columns,
    rowHeight,
    fontSize,
  };
}

/** A file name like "rattlers-vs-lakeside-batting-order.png". */
export function cardFileName(teamName: string, opponent: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${[slug(teamName), "vs", slug(opponent), "batting-order"].filter(Boolean).join("-")}.png`;
}
