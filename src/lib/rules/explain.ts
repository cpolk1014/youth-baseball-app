import { RULE_CATALOG } from "./catalog";
import { isRuleOn } from "./config";
import { describeCustomRule, ordinal, OUTFIELD_GROUP } from "./custom";
import { computeParticipation, emptyParticipation } from "./participation";
import type { Lineup, Player, Position, RuleConfig, SeasonHistory, Violation } from "./types";

export interface PlayerExplanation {
  playerId: string;
  name: string;
  /** One short headline, e.g. "Sat the 3rd and 5th · 2 infield, 2 outfield". */
  summary: string;
  /** The reasons, from the same facts auto-fill uses. */
  reasons: string[];
}

export interface LineupExplanation {
  /** How the lineup was made, when it isn't the usual fair-play auto-fill. */
  intro?: string[];
  /** Rules that are on and that this lineup follows. */
  followed: string[];
  /** Rules this lineup bends (warnings) or breaks, in plain words. */
  tradeoffs: string[];
  players: PlayerExplanation[];
  /** Kids marked absent for this game. */
  absent: string[];
}

const innList = (ns: number[]) => {
  const words = ns.map(ordinal);
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Why a lineup looks the way it does, built only from facts: the rules that are on, each
 * kid's innings today, and their season so far. Ties (two equally fair choices) aren't given
 * invented reasons.
 */
export function explainLineup(
  roster: Player[],
  lineup: Lineup,
  config: RuleConfig,
  history: SeasonHistory,
  violations: Violation[],
): LineupExplanation {
  const absentIds = new Set(lineup.absent ?? []);
  const players = roster.filter((p) => p.active !== false && !absentIds.has(p.id));
  const infield = new Set<Position>(config.infieldPositions);
  const outfield = new Set<Position>(OUTFIELD_GROUP);

  // Rules followed: on, with nothing reported against them.
  const broken = new Set(
    violations.map((v) => (v.rule === "custom" ? `custom:${v.customRuleId}` : v.rule)),
  );
  const followed = [
    ...RULE_CATALOG.filter((r) => isRuleOn(config, r.id) && !broken.has(r.id)).map((r) =>
      r.describe(config),
    ),
    ...config.custom
      .filter((r) => r.setting !== "off" && !broken.has(`custom:${r.id}`))
      .map((r) => describeCustomRule(r, roster)),
  ];
  const tradeoffs = violations.map(
    (v) => `${v.severity === "block" ? "Must fix: " : ""}${v.message}`,
  );

  // Season so far (before this game), as a rate so kids who missed games are compared fairly.
  const season = computeParticipation(history, config.infieldPositions);
  const rates = players.map((p) => {
    const t = season[p.id] ?? emptyParticipation();
    const innings = t.field + t.bench;
    return {
      id: p.id,
      t,
      innings,
      bench: innings ? t.bench / innings : null,
      inf: innings ? t.infield / innings : null,
    };
  });
  const known = rates.filter((r) => r.bench !== null);
  const avg = (k: "bench" | "inf") =>
    known.length ? known.reduce((s, r) => s + r[k]!, 0) / known.length : null;
  const avgBench = avg("bench");
  const avgInf = avg("inf");

  const explanations = players.map((p): PlayerExplanation => {
    const mine = lineup.slots
      .filter((s) => s.playerId === p.id && s.inning >= 1 && s.inning <= lineup.innings)
      .sort((a, b) => a.inning - b.inning);
    const sat = mine.filter((s) => s.position === "BENCH").map((s) => s.inning);
    const inf = mine.filter((s) => infield.has(s.position)).length;
    const out = mine.filter((s) => outfield.has(s.position)).length;
    const pitched = mine.filter((s) => s.position === "P").map((s) => s.inning);
    const caught = mine.filter((s) => s.position === "C").map((s) => s.inning);
    const reasons: string[] = [];

    const rate = rates.find((r) => r.id === p.id)!;
    if (rate.bench !== null && avgBench !== null) {
      const diff = rate.bench - avgBench;
      const so = `So far: sat ${plural(rate.t.bench, "inning")} of ${rate.innings}`;
      if (diff > 0.05)
        reasons.push(`${so}, more than most, so auto-fill leans toward playing them.`);
      else if (diff < -0.05)
        reasons.push(`${so}, less than most, so they're first in line to sit.`);
      else reasons.push(`${so}, about the team average.`);
    } else {
      reasons.push("No finished games yet this season, so today's sits are spread evenly.");
    }
    if (rate.inf !== null && avgInf !== null && avgInf - rate.inf > 0.05) {
      reasons.push(
        "Behind the team on infield innings this season, so auto-fill favors the infield for them.",
      );
    }
    if (pitched.length) {
      reasons.push(
        config.coachPitch
          ? `Played P in the ${innList(pitched)}.`
          : `Pitched the ${innList(pitched)}${config.maxInningsPitched && isRuleOn(config, "max-innings-pitched") ? ` (limit ${config.maxInningsPitched})` : ""}.`,
      );
    }
    if (caught.length) reasons.push(`Caught the ${innList(caught)}.`);
    if (sat.length === 0)
      reasons.push("Plays every inning: with this many kids, not everyone needs to sit.");
    if (p.preferredPositions.length) {
      const liked = mine.filter(
        (s) => s.position !== "BENCH" && p.preferredPositions.includes(s.position as never),
      ).length;
      reasons.push(
        liked
          ? `Played a preferred spot (${p.preferredPositions.join(", ")}) ${plural(liked, "inning")}.`
          : `Didn't get a preferred spot (${p.preferredPositions.join(", ")}): other rules came first.`,
      );
    }
    for (const r of config.custom) {
      if (r.setting === "off") continue;
      if ((r.kind === "locked" || r.kind === "never-plays") && r.playerId === p.id) {
        reasons.push(`Your rule: ${describeCustomRule(r, roster)}.`);
      }
    }
    const theirIssues = violations.filter((v) => v.playerId === p.id).map((v) => v.message);
    reasons.push(...theirIssues.map((m) => `Heads up: ${m}`));

    const summary = [
      sat.length ? `Sat the ${innList(sat)}` : "Plays every inning",
      `${inf} infield`,
      `${out} outfield`,
    ].join(" · ");
    return { playerId: p.id, name: p.name, summary, reasons };
  });

  return {
    followed,
    tradeoffs,
    players: explanations,
    absent: roster.filter((p) => absentIds.has(p.id)).map((p) => p.name),
  };
}
