import { RULE_CATALOG } from "./catalog";
import { MIN_IP, MIN_PA, type CompetitivePlan } from "./competitive";
import { isRuleOn } from "./config";
import { describeCustomRule, ordinal, OUTFIELD_GROUP } from "./custom";
import type { LineupExplanation, PlayerExplanation } from "./explain";
import type { FieldPosition, Lineup, Player, Position, RuleConfig, Violation } from "./types";

// "Why this lineup?" for a competitive lineup: the stats behind each kid's batting spot,
// positions and sits. Built only from the stats and the lineup as it stands (a coach's
// changes after auto-fill are called out, not explained away).

const innList = (ns: number[]) => {
  const words = ns.map(ordinal);
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
};
/** Baseball style: .345 under 1, 1.105 at or above. */
const rate = (x: number) => (x < 1 ? x.toFixed(3).replace(/^0/, "") : x.toFixed(3));
/** Innings with thirds: 36⅓. */
const inn = (x: number) => {
  const whole = Math.floor(x + 1e-9);
  const third = Math.round((x - whole) * 3);
  return `${whole}${third === 1 ? "⅓" : third === 2 ? "⅔" : ""}`;
};
const nth = (n: number) => ordinal(n);

/**
 * Explain a competitive lineup. Without a plan (people who can't see stats, like parents)
 * it says how the lineup was made and lists each kid's innings, with no numbers.
 */
export function explainCompetitive(
  roster: Player[],
  lineup: Lineup,
  config: RuleConfig,
  violations: Violation[],
  plan: CompetitivePlan | null,
  importedOn: string | null,
): LineupExplanation {
  const absentIds = new Set(lineup.absent ?? []);
  const players = roster.filter((p) => p.active !== false && !absentIds.has(p.id));
  const infield = new Set<Position>(config.infieldPositions);
  const outfield = new Set<Position>(OUTFIELD_GROUP);

  const broken = new Set(
    violations.map((v) => (v.rule === "custom" ? `custom:${v.customRuleId}` : v.rule)),
  );
  const followed = [
    ...RULE_CATALOG.filter(
      (r) => isRuleOn(config, r.id) && config.severity[r.id] === "block" && !broken.has(r.id),
    ).map((r) => r.describe(config)),
    ...config.custom
      .filter((r) => r.setting === "block" && !broken.has(`custom:${r.id}`))
      .map((r) => describeCustomRule(r, roster)),
  ];
  const tradeoffs = violations.map(
    (v) => `${v.severity === "block" ? "Must fix: " : ""}${v.message}`,
  );
  const intro = [
    `Competitive lineup: built to win from GameChanger stats${importedOn ? ` (imported ${importedOn})` : ""}.`,
    "Must rules still apply. Warn rules were set aside, so anything they flag is listed under trade-offs.",
  ];
  if (plan) {
    intro.push(
      "Batting: best on-base % lead off and bat 2nd, the best overall hitter (OPS) 3rd, the most power (SLG) 4th, then by OPS. Fielding: kids play where they've played most and fielded best; the strongest pitcher by WHIP starts. The weakest by stats sit first.",
      `Small samples are pulled toward the team average, and kids with under ${MIN_PA} plate appearances or ${MIN_IP} innings pitched rank after the rest.`,
    );
  }

  // Overall rank today (1 = strongest), for sits.
  const byOverall = plan
    ? [...players].sort((a, b) => (plan.overall.get(b.id) ?? 0) - (plan.overall.get(a.id) ?? 0))
    : [];
  const overallRank = (id: string) => byOverall.findIndex((p) => p.id === id) + 1;
  const batting = lineup.battingOrder.filter(
    (id) => !(lineup.notBatting ?? []).includes(id) && !absentIds.has(id),
  );
  const planOrder = plan ? plan.battingOrder.filter((id) => batting.includes(id)) : [];
  // Ranked among the kids who could pitch today (everyone, if eligibility is off).
  const canPitch = (p: Player) => p.canPitch || !isRuleOn(config, "pitcher-eligibility");
  const pitchPool = plan
    ? players
        .filter((p) => canPitch(p) && (plan.adjusted.get(p.id)?.whip ?? null) !== null)
        .sort((a, b) => plan.adjusted.get(a.id)!.whip! - plan.adjusted.get(b.id)!.whip!)
    : [];
  const pitchRank = (id: string) => pitchPool.findIndex((p) => p.id === id) + 1;
  const inningsRank = (id: string, pos: FieldPosition) => {
    if (!plan) return 0;
    const at = (pid: string) => plan.lines.get(pid)?.innings[pos] ?? 0;
    const mine = at(id);
    return mine > 0 ? players.filter((p) => at(p.id) > mine).length + 1 : 0;
  };

  const explanations = players.map((p): PlayerExplanation => {
    const mine = lineup.slots
      .filter((s) => s.playerId === p.id && s.inning >= 1 && s.inning <= lineup.innings)
      .sort((a, b) => a.inning - b.inning);
    const sat = mine.filter((s) => s.position === "BENCH").map((s) => s.inning);
    const inf = mine.filter((s) => infield.has(s.position)).length;
    const out = mine.filter((s) => outfield.has(s.position)).length;
    const summary = [
      sat.length ? `Sat the ${innList(sat)}` : "Plays every inning",
      `${inf} infield`,
      `${out} outfield`,
    ].join(" · ");
    const reasons: string[] = [];
    const theirIssues = violations.filter((v) => v.playerId === p.id).map((v) => v.message);
    if (!plan) {
      reasons.push(...theirIssues.map((m) => `Heads up: ${m}`));
      return { playerId: p.id, name: p.name, summary, reasons };
    }

    const line = plan.lines.get(p.id);
    const adj = plan.adjusted.get(p.id);
    if (!line)
      reasons.push("No GameChanger stats matched to them, so they count as about average.");

    // Batting spot.
    const spot = batting.indexOf(p.id) + 1;
    const planned = planOrder.indexOf(p.id) + 1;
    const role = plan.battingRole.get(p.id);
    const small =
      line && line.pa > 0 && line.pa < MIN_PA ? ` (only ${line.pa} plate appearances)` : "";
    if (spot === 0) {
      reasons.push("Not in the batting order today.");
    } else if (spot !== planned) {
      reasons.push(
        `Bats ${nth(spot)}: moved from ${nth(planned)}, where the stats put them${adj?.ops != null ? ` (OPS ${rate(line!.ops!)})` : ""}.`,
      );
    } else if (role === "none" || !line || line.ops === null) {
      reasons.push(`Bats ${nth(spot)}: no GameChanger batting stats, so after the rest.`);
    } else if (role === "obp") {
      reasons.push(
        `Bats ${nth(spot)}: ${spot === 1 ? "best" : "next-best"} on-base % (${rate(line.obp!)} OBP)${small}.`,
      );
    } else if (role === "ops") {
      reasons.push(`Bats ${nth(spot)}: best overall hitter left (${rate(line.ops)} OPS)${small}.`);
    } else if (role === "slg") {
      reasons.push(`Bats ${nth(spot)}: most power left (${rate(line.slg!)} SLG)${small}.`);
    } else {
      reasons.push(`Bats ${nth(spot)}: ${rate(line.ops)} OPS${small}.`);
    }

    // Positions.
    const byPos = new Map<FieldPosition, number[]>();
    for (const s of mine) {
      if (s.position === "BENCH") continue;
      byPos.set(s.position, [...(byPos.get(s.position) ?? []), s.inning]);
    }
    for (const [pos, ins] of byPos) {
      const when = `the ${innList(ins)}`;
      if (pos === "P") {
        if (config.coachPitch) {
          reasons.push(`Plays P ${when}.`);
        } else if (line && line.ip > 0 && line.whip !== null) {
          const r = pitchRank(p.id);
          reasons.push(
            `Pitches ${when}: ${line.whip.toFixed(2)} WHIP over ${inn(line.ip)} innings, ${pitchPool.length === 1 ? "the only one who can pitch today with pitching stats" : `${r === 1 ? "best" : `${nth(r)}-best`} of the ${pitchPool.length} who can pitch today`}${line.ip < MIN_IP ? " (a small sample)" : ""}.`,
          );
        } else {
          reasons.push(
            `Pitches ${when}: no GameChanger pitching stats; needed to cover the innings.`,
          );
        }
        continue;
      }
      const seen = line?.innings[pos === "LCF" || pos === "RCF" ? "CF" : pos] ?? 0;
      const r = inningsRank(p.id, pos === "LCF" || pos === "RCF" ? "CF" : pos);
      if (!line) {
        reasons.push(`Plays ${pos} ${when}.`);
      } else if (seen > 0) {
        reasons.push(
          `Plays ${pos} ${when}: ${r === 1 ? "most" : `${nth(r)}-most`} innings there this season (${inn(seen)})${line.fpct !== null && line.chances > 0 ? `, fielding ${rate(line.fpct)}` : ""}.`,
        );
      } else if (pos === "C") {
        reasons.push(
          `Catches ${when}: one of the kids who can catch today; no catching innings in GameChanger yet.`,
        );
      } else {
        reasons.push(
          `Plays ${pos} ${when}: no innings there yet this season; the spot was open after stronger fits were placed.`,
        );
      }
    }

    // Sits.
    const rank = overallRank(p.id);
    const of = players.length;
    if (sat.length) {
      reasons.push(
        `Sits the ${innList(sat)}: ranks ${nth(rank)} of ${of} by stats (batting and fielding together), and the weakest sit first within the Must rules.`,
      );
    } else if (mine.length) {
      reasons.push(`Plays every inning: ranks ${nth(rank)} of ${of} by stats.`);
    }

    for (const r of config.custom) {
      if (r.setting !== "block") continue;
      if ((r.kind === "locked" || r.kind === "never-plays") && r.playerId === p.id) {
        reasons.push(`Your rule: ${describeCustomRule(r, roster)}.`);
      }
    }
    reasons.push(...theirIssues.map((m) => `Heads up: ${m}`));
    return { playerId: p.id, name: p.name, summary, reasons };
  });

  return {
    intro,
    followed,
    tradeoffs,
    players: explanations,
    absent: roster.filter((p) => absentIds.has(p.id)).map((p) => p.name),
  };
}
