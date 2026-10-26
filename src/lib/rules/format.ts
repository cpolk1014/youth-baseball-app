import type { Lineup, Player } from "./types";

/**
 * Plain-text players × innings grid in batting order, e.g. for a quick preview or a
 * text post. Bench innings show as "--".
 */
export function formatLineupGrid(roster: Player[], lineup: Lineup): string {
  const byId = new Map(roster.map((p) => [p.id, p]));
  // Batters in order, then players sitting out of the batting order ("-.").
  const ids = [...lineup.battingOrder, ...(lineup.notBatting ?? [])];
  const label = (id: string, i: number) => {
    const p = byId.get(id);
    const jersey = p?.jerseyNumber != null ? `#${p.jerseyNumber} ` : "";
    const slot = i < lineup.battingOrder.length ? `${i + 1}.` : "-.";
    return `${slot} ${jersey}${p?.name ?? id}`;
  };
  const labels = ids.map(label);
  const width = Math.max(6, ...labels.map((l) => l.length));
  const cell = (s: string) => s.padEnd(4);
  const innings = Array.from({ length: lineup.innings }, (_, i) => i + 1);

  const header = "".padEnd(width) + "  " + innings.map((n) => cell(String(n))).join("");
  const rows = ids.map((id, i) => {
    const cells = innings.map((inning) => {
      const slot = lineup.slots.find((s) => s.playerId === id && s.inning === inning);
      return cell(!slot ? "?" : slot.position === "BENCH" ? "--" : slot.position);
    });
    return labels[i]!.padEnd(width) + "  " + cells.join("");
  });
  return [header, ...rows].map((line) => line.trimEnd()).join("\n");
}
