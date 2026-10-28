import type {
  CustomRule,
  FieldPosition,
  Lineup,
  Player,
  Position,
  RuleConfig,
  Violation,
} from "./types";

// Coaches' own rules, built from rule types. Pure: describing, checking a lineup against
// them, and checking a new rule against the team before it's saved.

export const INFIELD_GROUP: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS"];
export const OUTFIELD_GROUP: FieldPosition[] = ["LF", "CF", "RF", "LCF", "RCF"];

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const POSITION_NAME: Record<FieldPosition, string> = {
  P: "pitcher",
  C: "catcher",
  "1B": "1st base",
  "2B": "2nd base",
  "3B": "3rd base",
  SS: "shortstop",
  LF: "left field",
  CF: "center field",
  RF: "right field",
  LCF: "left center",
  RCF: "right center",
};

/** "the infield", "the outfield", "catcher", or "1st base or 2nd base". */
export function positionsText(positions: FieldPosition[]): string {
  const set = new Set(positions);
  const isGroup = (g: FieldPosition[]) => g.every((p) => set.has(p)) && set.size === g.length;
  if (isGroup(INFIELD_GROUP)) return "the infield";
  if (
    isGroup(OUTFIELD_GROUP) ||
    (set.size === 3 && ["LF", "CF", "RF"].every((p) => set.has(p as FieldPosition)))
  ) {
    return "the outfield";
  }
  return positions.map((p) => POSITION_NAME[p]).join(" or ");
}

/** A custom rule in plain English. */
export function describeCustomRule(rule: CustomRule, players: Player[]): string {
  const who = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "A player who left the team";
  switch (rule.kind) {
    case "position-min":
      return `Everyone plays at least ${plural(rule.innings, "inning")} at ${positionsText(rule.positions)}`;
    case "position-max":
      return `No one plays ${positionsText(rule.positions)} more than ${plural(rule.innings, "inning")}`;
    case "never-plays":
      return `${who(rule.playerId)} never plays ${positionsText(rule.positions)}`;
    case "locked":
      return `${who(rule.playerId)} plays ${POSITION_NAME[rule.position]} in the ${ordinal(rule.inning)} inning`;
    case "no-repeat-bench":
      return `No one sits the ${ordinal(rule.inning)} inning two games in a row`;
    case "leadoff-rotation":
      return "The leadoff hitter changes every game";
  }
}

const isOn = (rule: CustomRule) => rule.setting !== "off";

/** Positions each present player holds per inning: [inning][playerId] → position. */
function positionsBy(lineup: Lineup): Map<number, Map<string, Position>> {
  const grid = new Map<number, Map<string, Position>>();
  for (const s of lineup.slots) {
    if (s.inning < 1 || s.inning > lineup.innings) continue;
    if (!grid.has(s.inning)) grid.set(s.inning, new Map());
    grid.get(s.inning)!.set(s.playerId, s.position);
  }
  return grid;
}

/** Check a lineup against the coach's own rules. `players` are those at this game. */
export function checkCustomRules(
  players: Player[],
  lineup: Lineup,
  config: RuleConfig,
  previous: Lineup | null,
): Violation[] {
  const out: Violation[] = [];
  const grid = positionsBy(lineup);
  const prevGrid = previous ? positionsBy(previous) : null;
  const present = new Map(players.map((p) => [p.id, p]));
  const field = new Set(config.fieldPositions);

  for (const rule of config.custom) {
    if (!isOn(rule)) continue;
    const severity = rule.setting === "warn" ? "warn" : "block";
    const emit = (v: Omit<Violation, "rule" | "severity" | "customRuleId">) =>
      out.push({ rule: "custom", customRuleId: rule.id, severity, ...v });
    const count = (playerId: string, positions: FieldPosition[]) => {
      let n = 0;
      for (const row of grid.values()) {
        const pos = row.get(playerId);
        if (pos && pos !== "BENCH" && positions.includes(pos)) n++;
      }
      return n;
    };

    switch (rule.kind) {
      case "position-min": {
        // Only positions this game actually has (no LCF in a 9-fielder game).
        const positions = rule.positions.filter((p) => field.has(p));
        if (positions.length === 0) break;
        for (const p of players) {
          const n = count(p.id, positions);
          if (n < rule.innings) {
            emit({
              playerId: p.id,
              message: `${p.name} plays ${plural(n, "inning")} at ${positionsText(rule.positions)} (at least ${rule.innings}).`,
            });
          }
        }
        break;
      }
      case "position-max":
        for (const p of players) {
          const n = count(p.id, rule.positions);
          if (n > rule.innings) {
            emit({
              playerId: p.id,
              message: `${p.name} plays ${positionsText(rule.positions)} for ${plural(n, "inning")} (at most ${rule.innings}).`,
            });
          }
        }
        break;
      case "never-plays": {
        const p = present.get(rule.playerId);
        if (!p) break;
        for (const [inning, row] of grid) {
          const pos = row.get(p.id);
          if (pos && pos !== "BENCH" && rule.positions.includes(pos)) {
            emit({
              playerId: p.id,
              inning,
              message: `${p.name} shouldn't play ${POSITION_NAME[pos]} (inning ${inning}).`,
            });
          }
        }
        break;
      }
      case "locked": {
        const p = present.get(rule.playerId);
        if (!p || rule.inning > lineup.innings || !field.has(rule.position)) break;
        const pos = grid.get(rule.inning)?.get(p.id);
        if (pos !== rule.position) {
          emit({
            playerId: p.id,
            inning: rule.inning,
            message: `${p.name} should play ${POSITION_NAME[rule.position]} in the ${ordinal(rule.inning)} inning.`,
          });
        }
        break;
      }
      case "no-repeat-bench": {
        if (!prevGrid) break;
        for (const p of players) {
          if (
            grid.get(rule.inning)?.get(p.id) === "BENCH" &&
            prevGrid.get(rule.inning)?.get(p.id) === "BENCH"
          ) {
            emit({
              playerId: p.id,
              inning: rule.inning,
              message: `${p.name} sat the ${ordinal(rule.inning)} inning last game too.`,
            });
          }
        }
        break;
      }
      case "leadoff-rotation": {
        const lead = lineup.battingOrder[0];
        if (previous && lead && lead === previous.battingOrder[0]) {
          emit({
            playerId: lead,
            message: `${present.get(lead)?.name ?? "The same player"} led off last game too.`,
          });
        }
        break;
      }
    }
  }
  return out;
}

/** Move last game's leadoff hitter to the end of the order (for the leadoff-rotation rule). */
export function rotateLeadoff(order: string[], previousLeadoff: string | undefined): string[] {
  if (!previousLeadoff || order[0] !== previousLeadoff) return order;
  return [...order.slice(1), order[0]!];
}

export interface TeamShape {
  /** Active players. */
  players: Player[];
  /** A typical game for this team. */
  innings: number;
  fieldPositions: FieldPosition[];
  coachPitch: boolean;
}

/**
 * Problems with a new rule before it's saved: things that can't work with this roster, or
 * that clash with the coach's other rules. Empty means it looks fine.
 */
export function customRuleProblems(
  rule: CustomRule,
  team: TeamShape,
  others: CustomRule[],
): string[] {
  const problems: string[] = [];
  const { players, innings, fieldPositions } = team;
  const field = new Set(fieldPositions);
  const name = (id: string) => players.find((p) => p.id === id)?.name;
  const canPlay = (p: Player, pos: FieldPosition) =>
    (pos !== "C" || p.canCatch) && (pos !== "P" || team.coachPitch || p.canPitch);
  const on = others.filter((o) => o.id !== rule.id && o.setting !== "off");

  switch (rule.kind) {
    case "position-min": {
      const spots = rule.positions.filter((p) => field.has(p)).length;
      if (spots === 0) {
        problems.push("Your games don't use those positions.");
      } else if (rule.innings > innings) {
        problems.push(`Games are ${innings} innings, so nobody can get ${rule.innings} there.`);
      } else if (players.length * rule.innings > innings * spots) {
        problems.push(
          `${players.length} kids × ${plural(rule.innings, "inning")} needs ${players.length * rule.innings} turns there, but a ${innings}-inning game only has ${innings * spots}. Try ${Math.floor((innings * spots) / Math.max(players.length, 1))}.`,
        );
      }
      break;
    }
    case "position-max": {
      for (const pos of rule.positions.filter((p) => field.has(p))) {
        const able = players.filter((p) => canPlay(p, pos)).length;
        if (able * rule.innings < innings) {
          problems.push(
            `Only ${plural(able, "kid")} can play ${POSITION_NAME[pos]}, so at ${plural(rule.innings, "inning")} each they can't cover a ${innings}-inning game.`,
          );
        }
      }
      break;
    }
    case "never-plays": {
      if (!name(rule.playerId)) problems.push("That player isn't on the active roster.");
      for (const pos of rule.positions) {
        if (pos !== "C" && !(pos === "P" && !team.coachPitch)) continue;
        const left = players.filter((p) => p.id !== rule.playerId && canPlay(p, pos)).length;
        if (left === 0) problems.push(`Nobody else can play ${POSITION_NAME[pos]}.`);
      }
      break;
    }
    case "locked": {
      const p = players.find((x) => x.id === rule.playerId);
      if (!p) problems.push("That player isn't on the active roster.");
      if (!field.has(rule.position))
        problems.push(`Your games don't use ${POSITION_NAME[rule.position]}.`);
      if (rule.inning > innings) problems.push(`Games are ${innings} innings.`);
      if (p && !canPlay(p, rule.position)) {
        problems.push(
          `${p.name} isn't marked as able to ${rule.position === "C" ? "catch" : "pitch"}.`,
        );
      }
      for (const o of on) {
        if (
          o.kind === "never-plays" &&
          o.playerId === rule.playerId &&
          o.positions.includes(rule.position)
        ) {
          problems.push(`This clashes with “${describeCustomRule(o, players)}”.`);
        }
        if (
          o.kind === "locked" &&
          o.inning === rule.inning &&
          (o.position === rule.position || o.playerId === rule.playerId)
        ) {
          problems.push(`This clashes with “${describeCustomRule(o, players)}”.`);
        }
      }
      break;
    }
    case "no-repeat-bench":
      if (rule.inning > innings) problems.push(`Games are ${innings} innings.`);
      else if (players.length <= fieldPositions.length) {
        problems.push(
          "Nobody sits in your games with this roster, so this rule won't do anything yet.",
        );
      }
      break;
    case "leadoff-rotation":
      break;
  }

  if (rule.kind === "never-plays") {
    for (const o of on) {
      if (
        o.kind === "locked" &&
        o.playerId === rule.playerId &&
        rule.positions.includes(o.position)
      ) {
        problems.push(`This clashes with “${describeCustomRule(o, players)}”.`);
      }
    }
  }
  const same = on.find(
    (o) =>
      JSON.stringify({ ...o, id: "", setting: "" }) ===
      JSON.stringify({ ...rule, id: "", setting: "" }),
  );
  if (same) problems.push("You already have this rule.");
  return problems;
}
