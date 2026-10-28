"use client";

import { useState } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { saveSeasonRules, useAppData } from "@/lib/data/store";
import {
  CORE_RULE_TEXT,
  isChanged,
  recommendedRules,
  rulesFor,
  setRuleNumber,
  setRuleSetting,
  type RuleInfo,
} from "@/lib/rules/catalog";
import { fieldPositionsFor, resolveRuleConfig, type RuleConfigInput } from "@/lib/rules/config";
import { describeCustomRule, type TeamShape } from "@/lib/rules/custom";
import type { CustomRule, RuleConfig, RuleSetting } from "@/lib/rules/types";
import { activePlayers } from "@/lib/lineup/edit";
import { CustomRuleForm } from "./CustomRuleForm";
import { AppShell, Loading } from "./AppShell";
import { Sheet } from "./Sheet";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const SETTINGS: { id: RuleSetting; label: string }[] = [
  { id: "block", label: "Must" },
  { id: "warn", label: "Warn" },
  { id: "off", label: "Off" },
];

/** The season's fair-play rules: must follow, warn or off, with each rule's number. */
export function FairPlayScreen() {
  const data = useAppData();
  const [confirmReset, setConfirmReset] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!data) {
    return (
      <AppShell title="Fair play rules" backHref="/season" tab="season">
        <Loading />
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editLineups;
  const input: RuleConfigInput = data.season.fairPlayRules ?? {};
  const config = { ...resolveRuleConfig(input), coachPitch: data.team.coachPitch };
  const rules = rulesFor(data.team.coachPitch);
  const changed = rules.some((r) => isChanged(config, r));
  const save = (next: RuleConfigInput) => saveSeasonRules(next);
  const custom = input.custom ?? [];
  const setCustom = (next: CustomRule[]) => save({ ...input, custom: next });
  // A typical game for this team, for checking new rules.
  const sizes = data.games.map((g) => g.innings);
  const typicalInnings = sizes.length
    ? [...sizes].sort(
        (a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length,
      )[0]!
    : 6;
  const fielders = data.games.some((g) => g.fieldPlayers === 10) || data.team.coachPitch ? 10 : 9;
  const team: TeamShape = {
    players: activePlayers(data.players),
    innings: typicalInnings,
    fieldPositions: fieldPositionsFor(fielders),
    coachPitch: data.team.coachPitch,
  };

  return (
    <AppShell
      title="Fair play rules"
      subtitle={`${data.team.coachPitch ? "Coach pitch" : "Kid pitch"} · ${data.season.name}`}
      backHref="/season"
      tab="season"
    >
      <p className="mb-4 text-base text-slate-700">
        <strong>Must</strong>: auto-fill always follows it, and breaking it is flagged in red.{" "}
        <strong>Warn</strong>: auto-fill tries to follow it; breaking it shows a yellow warning.{" "}
        <strong>Off</strong>: ignored. Changes apply to lineups from now on.
      </p>

      <section className="mb-5">
        <h2 className={heading}>Always on</h2>
        <ul className="rounded-xl border-2 border-slate-200 bg-white p-3 text-base text-slate-700">
          {CORE_RULE_TEXT.map((t) => (
            <li key={t} className="py-0.5">
              ✓ {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-5">
        <h2 className={heading}>
          {data.team.coachPitch ? "Coach pitch rules" : "Kid pitch rules"}
        </h2>
        <ul className="grid gap-2 md:grid-cols-2 md:items-start">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              info={r}
              config={config}
              canEdit={canEdit}
              onSetting={(s) => save(setRuleSetting(input, r.id, s))}
              onNumber={(n) => save(setRuleNumber(input, r, n))}
            />
          ))}
        </ul>
        {data.team.coachPitch && (
          <p className="mt-2 text-sm text-slate-600">
            Pitching rules are hidden: in coach&apos;s pitch, P is a fielding spot.
          </p>
        )}
      </section>

      <section className="mb-5">
        <h2 className={heading}>Your own rules</h2>
        {custom.length === 0 ? (
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-base text-slate-700">
            {canEdit
              ? "Add rules like “Everyone plays 2 innings in the outfield” or “Mason pitches the 1st”."
              : "None."}
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 md:items-start">
            {custom.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border-2 bg-white p-3 ${r.setting === "off" ? "border-slate-200 opacity-70" : "border-slate-300"}`}
              >
                <p className="text-base leading-snug font-semibold">
                  {describeCustomRule(r, data.players)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <SettingPicker
                    value={r.setting}
                    canBlock
                    disabled={!canEdit}
                    onChange={(s) =>
                      setCustom(custom.map((x) => (x.id === r.id ? { ...x, setting: s } : x)))
                    }
                  />
                  {canEdit && (
                    <button
                      onClick={() => setCustom(custom.filter((x) => x.id !== r.id))}
                      className="ml-auto h-10 rounded-lg px-3 text-base font-semibold text-red-700 underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
          >
            + Add a rule
          </button>
        )}
      </section>

      {canEdit && changed && (
        <button
          onClick={() => setConfirmReset(true)}
          className="h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
        >
          Reset to recommended
        </button>
      )}
      {!canEdit && <p className="text-base text-slate-600">Coaches set these rules.</p>}

      <Sheet open={adding} title="Add a rule" onClose={() => setAdding(false)}>
        {adding && (
          <CustomRuleForm
            config={config}
            team={team}
            onCancel={() => setAdding(false)}
            onAdd={(rule) => {
              setCustom([...custom, rule]);
              setAdding(false);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={confirmReset}
        title="Reset to recommended?"
        onClose={() => setConfirmReset(false)}
      >
        <p className="mb-4 text-lg">
          Every built-in rule goes back to the recommended setting for{" "}
          {data.team.coachPitch ? "coach pitch" : "kid pitch"}. Your own rules stay.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setConfirmReset(false)}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Keep mine
          </button>
          <button
            onClick={() => {
              save(recommendedRules(input));
              setConfirmReset(false);
            }}
            className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#152f55]"
          >
            Reset
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}

function RuleRow({
  info,
  config,
  canEdit,
  onSetting,
  onNumber,
}: {
  info: RuleInfo;
  config: RuleConfig;
  canEdit: boolean;
  onSetting: (s: RuleSetting) => void;
  onNumber: (n: number) => void;
}) {
  const setting = config.severity[info.id];
  const num = info.number ? (config[info.number.key] ?? info.number.min) : null;
  const step = info.number?.step ?? 1;
  const stepper =
    "flex size-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-xl font-bold active:bg-slate-100 disabled:opacity-30";

  return (
    <li
      className={`rounded-xl border-2 bg-white p-3 ${setting === "off" ? "border-slate-200 opacity-70" : "border-slate-300"}`}
    >
      <p className="text-base leading-snug font-semibold">{info.describe(config)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SettingPicker
          value={setting}
          canBlock={info.canBlock}
          disabled={!canEdit}
          onChange={onSetting}
        />
        {info.number && num !== null && setting !== "off" && canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <button
              aria-label="Lower"
              disabled={num <= info.number.min}
              onClick={() => onNumber(num - step)}
              className={stepper}
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-bold">
              {info.number.key === "minInningsPlayedPercent" ? `${num}%` : num}
            </span>
            <button
              aria-label="Raise"
              disabled={num >= info.number.max}
              onClick={() => onNumber(num + step)}
              className={stepper}
            >
              +
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Must / Warn / Off. */
function SettingPicker({
  value,
  canBlock,
  disabled,
  onChange,
}: {
  value: RuleSetting;
  canBlock: boolean;
  disabled: boolean;
  onChange: (s: RuleSetting) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Setting"
      className="flex rounded-lg border-2 border-slate-300 p-0.5"
    >
      {SETTINGS.filter((s) => canBlock || s.id !== "block").map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`h-10 min-w-14 rounded-md px-3 text-base font-bold ${
            value === o.id
              ? o.id === "block"
                ? "bg-red-700 text-white"
                : o.id === "warn"
                  ? "bg-amber-400 text-slate-900"
                  : "bg-slate-600 text-white"
              : "text-slate-700"
          } disabled:cursor-default`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
