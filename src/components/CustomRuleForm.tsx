"use client";

import { useMemo, useState } from "react";
import { newId, useAppData } from "@/lib/data/store";
import {
  INFIELD_GROUP,
  OUTFIELD_GROUP,
  customRuleProblems,
  describeCustomRule,
  ordinal,
  type TeamShape,
} from "@/lib/rules/custom";
import { generateLineup } from "@/lib/rules/generate";
import type { CustomRule, CustomRuleKind, FieldPosition, RuleConfig } from "@/lib/rules/types";
import { activePlayers } from "@/lib/lineup/edit";

const KINDS: { kind: CustomRuleKind; title: string; example: string }[] = [
  {
    kind: "position-min",
    title: "At least N innings at a spot",
    example: "Everyone plays 2 innings in the outfield",
  },
  {
    kind: "position-max",
    title: "At most N innings at a spot",
    example: "No one catches more than 3 innings",
  },
  { kind: "never-plays", title: "A player never plays a spot", example: "Owen never pitches" },
  { kind: "locked", title: "A player plays a spot in an inning", example: "Mason pitches the 1st" },
  {
    kind: "no-repeat-bench",
    title: "No one sits the same inning two games in a row",
    example: "Nobody sits the 1st inning twice in a row",
  },
  {
    kind: "leadoff-rotation",
    title: "Rotate the leadoff hitter",
    example: "A different kid leads off each game",
  },
];

const ALL: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "LCF", "RCF"];
const chip = (on: boolean) =>
  `h-11 min-w-11 rounded-lg border-2 px-3 text-base font-bold ${on ? "border-[var(--team)] bg-[var(--team)] text-white" : "border-slate-300 bg-white"}`;
const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const stepBtn =
  "flex size-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-xl font-bold active:bg-slate-100 disabled:opacity-30";

/** Pick a rule type, fill in the blanks, see it in plain English and any problems, add it. */
export function CustomRuleForm({
  config,
  team,
  onAdd,
  onCancel,
}: {
  config: RuleConfig;
  team: TeamShape;
  onAdd: (rule: CustomRule) => void;
  onCancel: () => void;
}) {
  const data = useAppData()!;
  const players = activePlayers(data.players);
  const [kind, setKind] = useState<CustomRuleKind | null>(null);
  const [positions, setPositions] = useState<FieldPosition[]>(
    OUTFIELD_GROUP.filter((p) => team.fieldPositions.includes(p)),
  );
  const [innings, setInnings] = useState(1);
  const [playerId, setPlayerId] = useState(players[0]?.id ?? "");
  const [position, setPosition] = useState<FieldPosition>("P");
  const [inning, setInning] = useState(1);
  const [setting, setSetting] = useState<"block" | "warn">("block");
  const [id] = useState(newId);

  const rule: CustomRule | null = useMemo(() => {
    if (!kind) return null;
    const base = { id, setting };
    switch (kind) {
      case "position-min":
      case "position-max":
        return positions.length ? { ...base, kind, positions, innings } : null;
      case "never-plays":
        return playerId && positions.length ? { ...base, kind, playerId, positions } : null;
      case "locked":
        return playerId ? { ...base, kind, playerId, position, inning } : null;
      case "no-repeat-bench":
        return { ...base, kind, inning };
      case "leadoff-rotation":
        return { ...base, kind };
    }
  }, [kind, id, setting, positions, innings, playerId, position, inning]);

  const problems = useMemo(
    () => (rule ? ruleProblems(rule, config, team) : []),
    [rule, team, config],
  );

  if (!kind) {
    return (
      <ul className="grid gap-2">
        {KINDS.map((k) => (
          <li key={k.kind}>
            <button
              onClick={() => setKind(k.kind)}
              className="flex min-h-16 w-full flex-col items-start justify-center rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-left active:bg-slate-50"
            >
              <span className="text-lg font-bold text-[var(--team)]">{k.title}</span>
              <span className="text-sm text-slate-600">e.g. {k.example}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            onClick={onCancel}
            className="h-12 w-full text-base font-semibold text-slate-700 underline"
          >
            Cancel
          </button>
        </li>
      </ul>
    );
  }

  const togglePos = (p: FieldPosition) =>
    setPositions(positions.includes(p) ? positions.filter((x) => x !== p) : [...positions, p]);
  const group = (g: FieldPosition[]) => g.filter((p) => team.fieldPositions.includes(p));
  const isGroup = (g: FieldPosition[]) =>
    group(g).length === positions.length && group(g).every((p) => positions.includes(p));
  const stepper = (
    value: number,
    set: (n: number) => void,
    min: number,
    max: number,
    label: string,
  ) => (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-base font-semibold">{label}</span>
      <button
        aria-label="Lower"
        disabled={value <= min}
        onClick={() => set(value - 1)}
        className={stepBtn}
      >
        −
      </button>
      <span className="w-10 text-center text-lg font-bold">{value}</span>
      <button
        aria-label="Raise"
        disabled={value >= max}
        onClick={() => set(value + 1)}
        className={stepBtn}
      >
        +
      </button>
    </div>
  );
  const usesPositions =
    kind === "position-min" || kind === "position-max" || kind === "never-plays";
  const usesPlayer = kind === "never-plays" || kind === "locked";

  return (
    <div className="flex flex-col gap-4">
      {usesPlayer && (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Player</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={field}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {usesPositions && (
        <div>
          <p className="mb-1 text-base font-semibold">Positions</p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              onClick={() => setPositions(group(INFIELD_GROUP))}
              className={chip(isGroup(INFIELD_GROUP))}
            >
              Infield
            </button>
            <button
              onClick={() => setPositions(group(OUTFIELD_GROUP))}
              className={chip(isGroup(OUTFIELD_GROUP))}
            >
              Outfield
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL.filter((p) => team.fieldPositions.includes(p)).map((p) => (
              <button key={p} onClick={() => togglePos(p)} className={chip(positions.includes(p))}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === "locked" && (
        <div>
          <p className="mb-1 text-base font-semibold">Position</p>
          <div className="flex flex-wrap gap-2">
            {ALL.filter((p) => team.fieldPositions.includes(p)).map((p) => (
              <button key={p} onClick={() => setPosition(p)} className={chip(position === p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {(kind === "position-min" || kind === "position-max") &&
        stepper(
          innings,
          setInnings,
          1,
          team.innings,
          kind === "position-min" ? "At least (innings)" : "At most (innings)",
        )}
      {(kind === "locked" || kind === "no-repeat-bench") &&
        stepper(inning, setInning, 1, team.innings, `Inning (${ordinal(inning)})`)}

      <div className="flex items-center gap-2">
        <span className="flex-1 text-base font-semibold">How strict</span>
        <div className="flex rounded-lg border-2 border-slate-300 p-0.5">
          {(["block", "warn"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSetting(s)}
              aria-pressed={setting === s}
              className={`h-10 min-w-16 rounded-md px-3 text-base font-bold ${
                setting === s
                  ? s === "block"
                    ? "bg-red-700 text-white"
                    : "bg-amber-400"
                  : "text-slate-700"
              }`}
            >
              {s === "block" ? "Must" : "Warn"}
            </button>
          ))}
        </div>
      </div>

      {rule && (
        <p className="rounded-xl bg-slate-100 p-3 text-lg font-semibold">
          “{describeCustomRule(rule, data.players)}”
        </p>
      )}
      {problems.length > 0 && (
        <ul className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base text-amber-950">
          {problems.map((p) => (
            <li key={p}>⚠ {p}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setKind(null)}
          className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Back
        </button>
        <button
          disabled={!rule}
          onClick={() => rule && onAdd(rule)}
          className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
        >
          {problems.length ? "Add anyway" : "Add rule"}
        </button>
      </div>
    </div>
  );
}

/**
 * Everything wrong with a new rule before it's saved: roster and clash checks, then a test
 * auto-fill to see whether it can actually be followed.
 */
export function ruleProblems(rule: CustomRule, config: RuleConfig, team: TeamShape): string[] {
  const found = customRuleProblems(rule, team, config.custom);
  if (found.length === 0 && rule.kind !== "leadoff-rotation" && rule.kind !== "no-repeat-bench") {
    const trial = { ...config, custom: [...config.custom, rule] };
    const { violations } = generateLineup(team.players, trial, [], 1, { innings: team.innings });
    if (violations.some((v) => v.customRuleId === rule.id)) {
      found.push("Auto-fill couldn't follow this in a test lineup with your roster.");
    }
  }
  return found;
}
