import type { StatLine } from "@/lib/rules/competitive";
import type { FieldPosition } from "@/lib/rules/types";
import { statNumber, type TeamStats } from "./gamechanger";

// Turning an imported GameChanger export into the numbers competitive lineups use.

const POSITIONS: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

/** Innings in box-score notation: "36.1" is 36⅓, "36.2" is 36⅔. */
export function inningsValue(value: string): number | null {
  const m = /^(\d+)(?:\.([012]))?$/.exec(value.trim());
  return m ? Number(m[1]) + Number(m[2] ?? 0) / 3 : null;
}

/** Each roster-matched player's stat line, by player id. */
export function statLines(stats: TeamStats): Map<string, StatLine> {
  const col = (group: string, key: string) =>
    stats.columns.findIndex((c) => c.group === group && c.key === key);
  const at = {
    pa: col("Batting", "PA"),
    obp: col("Batting", "OBP"),
    slg: col("Batting", "SLG"),
    ops: col("Batting", "OPS"),
    ip: col("Pitching", "IP"),
    whip: col("Pitching", "WHIP"),
    era: col("Pitching", "ERA"),
    fpct: col("Fielding", "FPCT"),
    tc: col("Fielding", "TC"),
  };
  const lines = new Map<string, StatLine>();
  for (const p of stats.players) {
    if (!p.playerId) continue;
    const v = (i: number) => (i < 0 ? "" : (p.values[i] ?? ""));
    const num = (i: number) => statNumber(v(i));
    const innings: StatLine["innings"] = {};
    for (const pos of POSITIONS) {
      const n = inningsValue(v(col("Fielding", pos)));
      if (n) innings[pos] = n;
    }
    lines.set(p.playerId, {
      pa: num(at.pa) ?? 0,
      obp: num(at.obp),
      slg: num(at.slg),
      ops: num(at.ops),
      ip: inningsValue(v(at.ip)) ?? 0,
      whip: num(at.whip),
      era: num(at.era),
      fpct: num(at.fpct),
      chances: num(at.tc) ?? 0,
      innings,
    });
  }
  return lines;
}
