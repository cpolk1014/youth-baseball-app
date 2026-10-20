// Prints a generated lineup for a sample 12-player roster: npm run sample:lineup [seed] [innings]
import { formatLineupGrid } from "../src/lib/rules/format";
import { generateLineup } from "../src/lib/rules/generate";
import { resolveRuleConfig } from "../src/lib/rules/config";
import { computeParticipation } from "../src/lib/rules/participation";
import type { FieldPosition, Player } from "../src/lib/rules/types";

const p = (
  id: string,
  name: string,
  jerseyNumber: number,
  preferredPositions: FieldPosition[],
  flags: { canPitch?: boolean; canCatch?: boolean } = {},
): Player => ({
  id,
  name,
  jerseyNumber,
  preferredPositions,
  canPitch: flags.canPitch ?? false,
  canCatch: flags.canCatch ?? false,
});

const roster: Player[] = [
  p("1", "Mason", 2, ["SS", "P"], { canPitch: true }),
  p("2", "Leo", 5, ["P", "3B"], { canPitch: true }),
  p("3", "Eli", 7, ["C"], { canCatch: true }),
  p("4", "Owen", 9, ["P", "1B"], { canPitch: true }),
  p("5", "Jack", 11, ["C", "3B"], { canCatch: true }),
  p("6", "Theo", 12, ["2B", "SS"]),
  p("7", "Lucas", 14, ["CF", "LF"]),
  p("8", "Sam", 17, []),
  p("9", "Noah", 21, ["1B", "RF"], { canPitch: true, canCatch: true }),
  p("10", "Ezra", 23, ["LF"]),
  p("11", "Miles", 27, []),
  p("12", "Caleb", 33, ["2B", "RF"]),
];

const seed = Number(process.argv[2] ?? 2026);
const innings = Number(process.argv[3] ?? 6);
const config = resolveRuleConfig();
const { lineup, violations } = generateLineup(roster, config, [], seed, { innings });

console.log(`Seed ${seed}, ${roster.length} players, ${innings} innings\n`);
console.log(formatLineupGrid(roster, lineup));

const totals = computeParticipation([lineup], config.infieldPositions);
console.log("\nPlayer        Field  Infield  Bench");
for (const player of roster) {
  const t = totals[player.id]!;
  console.log(
    `${player.name.padEnd(12)}  ${String(t.field).padStart(5)}  ${String(t.infield).padStart(7)}  ${String(t.bench).padStart(5)}`,
  );
}
console.log(
  violations.length
    ? `\nViolations:\n${violations.map((v) => `  [${v.severity}] ${v.rule}: ${v.message}`).join("\n")}`
    : "\nViolations: none",
);
